// Despacho: eventos → execuções. Automações nunca são chamadas direto (invariante 4): o worker lê os
// eventos ainda não despachados e cria automation_runs "queued" (a fila durável); o pg-boss só leva o id
// ao executor. Gatilhos agendados vêm da varredura periódica (varrerAgendadas).
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { automationRuns, automations, boards, cards, events, fields, workspaces } from "../db/schema";
import { dataNoFuso } from "../core/meta";
import { normalizarGatilho, type Gatilho } from "../lib/automacoes";
import { partesNoFuso, slotsEntre } from "../lib/cron";

/** Profundidade máxima de cascata (automação → evento → automação ...). */
export const MAX_PROFUNDIDADE = 5;
/** Só eventos recentes são considerados (a tabela de despacho é podada depois disso). */
const JANELA = sql`interval '1 day'`;
const TIPOS_EVENTO = ["card.created", "card.moved", "card.field_updated"];

type Automacao = typeof automations.$inferSelect;
type RunNovo = typeof automationRuns.$inferInsert;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ativa = and(inArray(automations.env, ["test", "published"]), eq(automations.enabled, true), isNull(automations.archivedAt), eq(automations.mode, "simple"));

function gatilhoDe(a: Automacao): Gatilho | null {
  try {
    return normalizarGatilho(a.trigger);
  } catch {
    return null; // configuração inválida: nunca dispara
  }
}

/** Insere execuções (dedupe por automação+chave) e devolve os ids criados. */
async function inserirRuns(tx: Tx, novos: RunNovo[]): Promise<string[]> {
  if (!novos.length) return [];
  const rows = await tx.insert(automationRuns).values(novos).onConflictDoNothing().returning({ id: automationRuns.id, status: automationRuns.status });
  return rows.filter((r) => r.status === "queued").map((r) => r.id);
}

/** Pais do card pela relação (qualquer lado), com ligação e card ativos. */
async function paisPela(tx: Tx, relacao: { id: string; boardId: string }, cardId: string, boardFilho: string): Promise<string[]> {
  const doFilho = relacao.boardId === boardFilho; // relação no board do filho: filho → pai (from → to)
  const rows = await tx.execute<{ id: string }>(
    doFilho
      ? sql`select l.to_card_id as id from card_links l join cards c on c.id = l.to_card_id
            where l.field_id = ${relacao.id} and l.from_card_id = ${cardId} and l.deleted_at is null and c.deleted_at is null`
      : sql`select l.from_card_id as id from card_links l join cards c on c.id = l.from_card_id
            where l.field_id = ${relacao.id} and l.to_card_id = ${cardId} and l.deleted_at is null and c.deleted_at is null`,
  );
  return [...new Set(rows.map((r) => r.id))];
}

/** Todos os filhos ativos do pai pela relação estão na fase? (sem filhos: não). */
async function todosNaFase(tx: Tx, relacao: { id: string; boardId: string }, paiId: string, boardPai: string, fase: string): Promise<boolean> {
  const doPai = relacao.boardId === boardPai;
  const [r] = await tx.execute<{ total: number; na_fase: number }>(
    doPai
      ? sql`select count(*)::int total, count(*) filter (where c.phase_id = ${fase})::int na_fase
            from card_links l join cards c on c.id = l.to_card_id
            where l.field_id = ${relacao.id} and l.from_card_id = ${paiId} and l.deleted_at is null and c.deleted_at is null`
      : sql`select count(*)::int total, count(*) filter (where c.phase_id = ${fase})::int na_fase
            from card_links l join cards c on c.id = l.from_card_id
            where l.field_id = ${relacao.id} and l.to_card_id = ${paiId} and l.deleted_at is null and c.deleted_at is null`,
  );
  return r.total > 0 && r.total === r.na_fase;
}

/**
 * Despacha os eventos ainda não despachados: cada automação cujo gatilho casa ganha uma execução.
 * Proteção contra loop: evento causado por uma execução herda profundidade e cadeia; suppress_triggers
 * da automação causadora não dispara nada; a mesma automação não dispara de novo no mesmo ciclo.
 */
export async function despacharEventos(limite = 200): Promise<string[]> {
  return db.transaction(async (tx) => {
    const reivindicados = await tx.execute<{ event_id: string }>(sql`
      insert into automation_dispatch (event_id)
      select e.id from events e
      where e.occurred_at > now() - ${JANELA}
        and e.type in (${sql.join(TIPOS_EVENTO.map((t) => sql`${t}`), sql`, `)})
        and e.workspace_deleted_at is null
        and not exists (select 1 from automation_dispatch d where d.event_id = e.id)
      order by e.occurred_at
      limit ${limite}
      on conflict do nothing
      returning event_id`);
    if (!reivindicados.length) return [];
    const evs = await tx.select().from(events).where(inArray(events.id, reivindicados.map((r) => r.event_id))).orderBy(events.occurredAt);
    const wsIds = [...new Set(evs.map((e) => e.workspaceId))];
    const autos = (await tx.select().from(automations).where(and(ativa, inArray(automations.workspaceId, wsIds))))
      .map((a) => ({ a, g: gatilhoDe(a) }))
      .filter((x): x is { a: Automacao; g: Gatilho } => x.g !== null && x.g.type !== "scheduled");
    if (!autos.length) return [];

    // Execuções que causaram eventos (cascata) e automações delas.
    const causas = [...new Set(evs.map((e) => e.automationRunId).filter((x): x is string => !!x))];
    const runsCausa = new Map(
      causas.length
        ? (await tx.select({ id: automationRuns.id, automationId: automationRuns.automationId, depth: automationRuns.depth, chain: automationRuns.chain }).from(automationRuns).where(inArray(automationRuns.id, causas))).map((r) => [r.id, r])
        : [],
    );
    const idsAutoCausa = [...new Set([...runsCausa.values()].map((r) => r.automationId).filter((x): x is string => !!x))];
    const suprime = new Set(
      idsAutoCausa.length ? (await tx.select({ id: automations.id }).from(automations).where(and(inArray(automations.id, idsAutoCausa), eq(automations.suppressTriggers, true)))).map((r) => r.id) : [],
    );
    const idsRelacoes = autos.flatMap((x) => (x.g.type === "all_children_in_phase" ? [x.g.relation] : []));
    const relacoes = new Map(
      idsRelacoes.length ? (await tx.select({ id: fields.id, boardId: fields.boardId }).from(fields).where(inArray(fields.id, idsRelacoes))).map((f) => [f.id, f]) : [],
    );

    const novos: RunNovo[] = [];
    for (const ev of evs) {
      const causa = ev.automationRunId ? runsCausa.get(ev.automationRunId) : undefined;
      if (causa?.automationId && suprime.has(causa.automationId)) continue;
      const depth = causa ? causa.depth + 1 : 0;
      const chain = causa ? [...causa.chain, ...(causa.automationId ? [causa.automationId] : [])] : [];
      const d = ev.data as Record<string, unknown>;
      for (const { a, g } of autos) {
        if (a.workspaceId !== ev.workspaceId || ev.occurredAt < a.updatedAt) continue;
        const alvos: { cardId: string; chave: string | null }[] = [];
        const doBoard = a.boardId === ev.boardId && !!ev.cardId;
        if (g.type === "card_created" && ev.type === "card.created" && doBoard) alvos.push({ cardId: ev.cardId!, chave: null });
        else if (g.type === "card_entered_phase" && ev.type === "card.moved" && doBoard && d.to_phase === g.phase) alvos.push({ cardId: ev.cardId!, chave: null });
        else if (g.type === "card_left_phase" && ev.type === "card.moved" && doBoard && d.from_phase === g.phase) alvos.push({ cardId: ev.cardId!, chave: null });
        else if (g.type === "field_updated" && ev.type === "card.field_updated" && doBoard && (!g.fields.length || g.fields.includes(String(d.field_id)))) {
          // Vários campos na mesma escrita = um disparo só.
          alvos.push({ cardId: ev.cardId!, chave: `campo:${ev.cardId}:${ev.occurredAt.toISOString()}` });
        } else if (g.type === "all_children_in_phase" && ev.type === "card.moved" && ev.cardId && d.to_phase === g.phase && a.boardId) {
          const rel = relacoes.get(g.relation);
          if (!rel) continue;
          for (const pai of await paisPela(tx, rel, ev.cardId, ev.boardId!)) {
            const [p] = await tx.select({ boardId: cards.boardId }).from(cards).where(eq(cards.id, pai));
            if (p?.boardId === a.boardId && (await todosNaFase(tx, rel, pai, a.boardId, g.phase))) alvos.push({ cardId: pai, chave: `filhos:${pai}:${ev.id}` });
          }
        }
        for (const alvo of alvos) {
          const base: RunNovo = {
            automationId: a.id,
            workspaceId: a.workspaceId,
            cardId: alvo.cardId,
            triggerEventId: ev.id,
            env: a.env === "test" ? "test" : "published",
            depth,
            chain,
            dedupeKey: alvo.chave,
            context: { gatilho: g.type, evento: ev.type, fase_origem: d.from_phase ?? null, fase_destino: d.to_phase ?? null },
            status: "queued",
          };
          if (chain.includes(a.id)) novos.push({ ...base, status: "skipped", error: "loop evitado: a automação já rodou neste ciclo", finishedAt: new Date() });
          else if (depth > MAX_PROFUNDIDADE) novos.push({ ...base, status: "skipped", error: `loop evitado: profundidade máxima de cascata (${MAX_PROFUNDIDADE})`, finishedAt: new Date() });
          else novos.push(base);
        }
      }
    }
    return inserirRuns(tx, novos);
  });
}

// ---------------------------------------------------------------------------
// Agendados
// ---------------------------------------------------------------------------

const somarDias = (data: string, dias: number) => {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const hhmm = (p: { hora: number; minuto: number }) => `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
const dataDe = (p: { ano: number; mes: number; dia: number }) => `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;

/**
 * Varredura dos gatilhos agendados (rodada pelo worker a cada ~30 s):
 * - cron: uma execução por instante que casa, desde a última publicação (até 10 min para trás);
 * - campo de data ± N dias na hora H: uma execução por card e data alvo, hoje (após H) ou ontem (atrasadas).
 */
export async function varrerAgendadas(agora = new Date()): Promise<string[]> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ a: automations, settings: workspaces.settings })
      .from(automations)
      .innerJoin(workspaces, eq(workspaces.id, automations.workspaceId))
      .innerJoin(boards, eq(boards.id, automations.boardId))
      .where(and(ativa, sql`${automations.trigger}->>'type' = 'scheduled'`, isNull(workspaces.archivedAt), isNull(workspaces.deletedAt), isNull(boards.archivedAt)));
    const novos: RunNovo[] = [];
    for (const { a, settings } of rows) {
      const g = gatilhoDe(a);
      if (g?.type !== "scheduled") continue;
      const tz = String((settings as { timezone?: string }).timezone ?? "America/Sao_Paulo");
      const base = { automationId: a.id, workspaceId: a.workspaceId, env: a.env === "test" ? ("test" as const) : ("published" as const), status: "queued" as const };
      if ("cron" in g) {
        const desde = new Date(Math.max(agora.getTime() - 10 * 60_000, a.updatedAt.getTime()));
        for (const slot of slotsEntre(g.cron, tz, desde, agora)) {
          novos.push({ ...base, cardId: null, dedupeKey: `cron:${slot.toISOString()}`, context: { gatilho: "scheduled", instante: slot.toISOString() } });
        }
        continue;
      }
      const agoraLocal = partesNoFuso(agora, tz);
      const publicada = partesNoFuso(a.updatedAt, tz);
      const hoje = dataNoFuso(tz, agora);
      for (const dia of [somarDias(hoje, -1), hoje]) {
        if (dia === hoje && hhmm(agoraLocal) < g.time) continue;
        // Não dispara o que venceu antes de a automação existir/mudar.
        const pub = dataDe(publicada);
        if (dia < pub || (dia === pub && g.time < hhmm(publicada))) continue;
        const alvo = somarDias(dia, -g.offset_days);
        const cs = await tx
          .select({ id: cards.id })
          .from(cards)
          .where(and(eq(cards.boardId, a.boardId!), isNull(cards.deletedAt), sql`left(${cards.props}->>${g.date_field}, 10) = ${alvo}`));
        for (const c of cs) novos.push({ ...base, cardId: c.id, dedupeKey: `data:${c.id}:${alvo}`, context: { gatilho: "scheduled", data: alvo } });
      }
    }
    return inserirRuns(tx, novos);
  });
}

/** Execuções que ficaram sem job (queda do worker): queued há mais de 1 min ou running há mais de 15 min. */
export async function pendentesParaReenviar(): Promise<string[]> {
  await db.execute(sql`update automation_runs set status = 'queued', started_at = null where status = 'running' and started_at < now() - interval '15 minutes'`);
  const rows = await db.execute<{ id: string }>(sql`select id from automation_runs where status = 'queued' and created_at < now() - interval '1 minute' order by created_at limit 500`);
  return rows.map((r) => r.id);
}

/** Poda a tabela de despacho (eventos fora da janela nunca voltam a ser considerados). */
export async function podarDespacho(): Promise<void> {
  await db.execute(sql`delete from automation_dispatch where dispatched_at < now() - interval '2 days'`);
}
