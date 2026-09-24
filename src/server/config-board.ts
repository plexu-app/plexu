import "server-only";
// Configuração de board: fases, campos, ajustes por fase e regras. Nunca toca em cards.
// Toda mudança emite config.changed na mesma transação (decisão 13).
import { and, asc, count, eq, isNull, max, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { boards, cards, fieldPhaseSettings, fields, phases, rules } from "@/db/schema";
import { emitirEventoConfig, garantirIndiceExclusivo, type Actor, type Tx } from "@/core";
import { parse } from "@/lib/expr";
import { ErroConfigCampo, expressoesDaConfig, normalizarConfig, TIPOS_VALIDOS, type ContextoConfig } from "@/lib/config-campos";
import { slugCampo, slugLivre } from "@/lib/slug";
import { ErroConfig } from "./config";

interface Alvo {
  wsId: string;
  boardId: string;
  actor: Actor;
}

type EntidadeConfig = Parameters<typeof emitirEventoConfig>[2]["entidade"];
type AcaoConfig = Parameters<typeof emitirEventoConfig>[2]["acao"];

async function registrar(tx: Tx, a: Alvo, entidade: EntidadeConfig, acao: AcaoConfig, id: string, dados?: Record<string, unknown>) {
  await emitirEventoConfig(tx, { workspaceId: a.wsId, boardId: a.boardId, actor: a.actor }, { entidade, acao, id, dados });
}

/** Valida uma expressão CEL opcional; vazio vira null. */
export function validarExpr(fonte: unknown, onde: string): string | null {
  const s = typeof fonte === "string" ? fonte.trim() : "";
  if (!s) return null;
  const r = parse(s);
  if (!r.ok) throw new ErroConfig(`${onde}: ${r.erro.mensagem}`);
  return s;
}

async function exigirBoardDoWs(tx: Tx, a: Alvo) {
  const [b] = await tx.select().from(boards).where(and(eq(boards.id, a.boardId), eq(boards.workspaceId, a.wsId)));
  if (!b) throw new ErroConfig("board não encontrado");
  return b;
}

// ---------------------------------------------------------------------------
// Fases
// ---------------------------------------------------------------------------

export async function criarFase(a: Alvo, nome: string) {
  const n = nome.trim();
  if (!n) throw new ErroConfig("nome da fase obrigatório");
  return db.transaction(async (tx) => {
    const b = await exigirBoardDoWs(tx, a);
    if (b.kind !== "workflow") throw new ErroConfig("board do tipo base não tem fases");
    const [{ m }] = await tx.select({ m: max(phases.position) }).from(phases).where(eq(phases.boardId, a.boardId));
    const [f] = await tx.insert(phases).values({ boardId: a.boardId, name: n, position: (m ?? -1) + 1 }).returning();
    await registrar(tx, a, "phase", "created", f.id, { name: n });
    return f;
  });
}

async function faseDoBoard(tx: Tx, a: Alvo, faseId: string) {
  await exigirBoardDoWs(tx, a);
  const [f] = await tx.select().from(phases).where(and(eq(phases.id, faseId), eq(phases.boardId, a.boardId), isNull(phases.archivedAt)));
  if (!f) throw new ErroConfig("fase não encontrada");
  return f;
}

export async function atualizarFase(a: Alvo, faseId: string, dados: { nome?: string; terminal?: boolean; cor?: string | null }) {
  return db.transaction(async (tx) => {
    const f = await faseDoBoard(tx, a, faseId);
    const nome = dados.nome?.trim();
    if (dados.nome !== undefined && !nome) throw new ErroConfig("nome da fase obrigatório");
    if (dados.cor && !/^#[0-9a-f]{6}$/i.test(dados.cor)) throw new ErroConfig("cor inválida (use #rrggbb)");
    const novo = {
      name: nome ?? f.name,
      isTerminal: dados.terminal ?? f.isTerminal,
      color: dados.cor === undefined ? f.color : dados.cor || null,
    };
    await tx.update(phases).set(novo).where(eq(phases.id, f.id));
    await registrar(tx, a, "phase", "updated", f.id, { antes: { name: f.name, is_terminal: f.isTerminal, color: f.color }, depois: novo });
  });
}

/** Troca a posição com a vizinha (direcao -1 sobe, +1 desce). Respeita unique(board_id, position). */
export async function moverFase(a: Alvo, faseId: string, direcao: -1 | 1) {
  return db.transaction(async (tx) => {
    const f = await faseDoBoard(tx, a, faseId);
    const todas = await tx
      .select()
      .from(phases)
      .where(and(eq(phases.boardId, a.boardId), isNull(phases.archivedAt)))
      .orderBy(asc(phases.position));
    const i = todas.findIndex((x) => x.id === f.id);
    const viz = todas[i + direcao];
    if (!viz) return;
    await tx.update(phases).set({ position: -1 - i }).where(eq(phases.id, f.id));
    await tx.update(phases).set({ position: f.position }).where(eq(phases.id, viz.id));
    await tx.update(phases).set({ position: viz.position }).where(eq(phases.id, f.id));
    await registrar(tx, a, "phase", "reordered", f.id, { de: f.position, para: viz.position });
  });
}

/** Arquiva a fase. Recusa se houver cards nela (mova-os antes). */
export async function arquivarFase(a: Alvo, faseId: string) {
  return db.transaction(async (tx) => {
    const f = await faseDoBoard(tx, a, faseId);
    const [{ n }] = await tx.select({ n: count() }).from(cards).where(and(eq(cards.phaseId, f.id), isNull(cards.deletedAt)));
    if (n > 0) throw new ErroConfig(`a fase tem ${n} card(s); mova-os antes de arquivar`);
    const [{ ativas }] = await tx
      .select({ ativas: count() })
      .from(phases)
      .where(and(eq(phases.boardId, a.boardId), isNull(phases.archivedAt)));
    if (ativas <= 1) throw new ErroConfig("o board precisa de ao menos uma fase");
    await tx.update(phases).set({ archivedAt: new Date() }).where(eq(phases.id, f.id));
    await registrar(tx, a, "phase", "archived", f.id, { name: f.name });
  });
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

export interface DadosCampo {
  nome: string;
  slug?: string;
  tipo: string;
  config: unknown;
  requiredExpr?: string;
  visibleExpr?: string;
  defaultValueExpr?: string;
  unico?: boolean;
  ajuda?: string;
  titulo?: boolean;
}

async function contextoConfig(tx: Tx, a: Alvo): Promise<ContextoConfig> {
  const bs = await tx.select({ id: boards.id, name: boards.name }).from(boards).where(and(eq(boards.workspaceId, a.wsId), isNull(boards.archivedAt)));
  const idsWs = new Set(bs.map((b) => b.id));
  const rels = await tx
    .select({ id: fields.id, boardId: fields.boardId, config: fields.config })
    .from(fields)
    .where(and(eq(fields.type, "relation"), isNull(fields.archivedAt)));
  const relacoes = new Map<string, { boardId: string; target: string }>();
  for (const r of rels) {
    const target = String(((r.config as Record<string, unknown>).relation as { target_board?: string } | undefined)?.target_board ?? "");
    if (!idsWs.has(r.boardId)) continue;
    if (r.boardId === a.boardId || target === a.boardId) relacoes.set(r.id, { boardId: r.boardId, target });
  }
  const campos = await tx
    .select({ id: fields.id, slug: fields.slug, type: fields.type })
    .from(fields)
    .where(and(eq(fields.boardId, a.boardId), isNull(fields.archivedAt)));
  return { boardId: a.boardId, boards: new Map(bs.map((b) => [b.id, b.name])), relacoes, campos };
}

function prepararCampo(d: DadosCampo, ctx: ContextoConfig) {
  const nome = d.nome.trim();
  if (!nome) throw new ErroConfig("nome do campo obrigatório");
  if (!TIPOS_VALIDOS.has(d.tipo)) throw new ErroConfig(`tipo inválido: ${d.tipo}`);
  let config: Record<string, unknown>;
  try {
    config = normalizarConfig(d.tipo, d.config, ctx);
  } catch (e) {
    if (e instanceof ErroConfigCampo) throw new ErroConfig(e.message);
    throw e;
  }
  for (const x of expressoesDaConfig(config)) validarExpr(x.fonte, x.onde);
  return {
    nome,
    config,
    requiredExpr: validarExpr(d.requiredExpr, "obrigatório se"),
    visibleExpr: validarExpr(d.visibleExpr, "visível se"),
    defaultValueExpr: validarExpr(d.defaultValueExpr, "valor padrão"),
  };
}

function validarSlug(slug: string) {
  if (!/^[a-z_][a-z0-9_]{0,39}$/.test(slug)) throw new ErroConfig("slug deve ter letras minúsculas, dígitos e _ (não começar com dígito)");
}

export async function criarCampo(a: Alvo, d: DadosCampo) {
  return db.transaction(async (tx) => {
    await exigirBoardDoWs(tx, a);
    const ctx = await contextoConfig(tx, a);
    const p = prepararCampo(d, ctx);
    const usados = await tx.select({ slug: fields.slug }).from(fields).where(eq(fields.boardId, a.boardId));
    const slug = d.slug?.trim() ? d.slug.trim() : slugLivre(slugCampo(p.nome), usados.map((u) => u.slug));
    validarSlug(slug);
    if (usados.some((u) => u.slug === slug)) throw new ErroConfig(`slug '${slug}' já existe neste board`);
    const [{ m }] = await tx.select({ m: max(fields.position) }).from(fields).where(eq(fields.boardId, a.boardId));
    const [f] = await tx
      .insert(fields)
      .values({
        boardId: a.boardId,
        type: d.tipo as never,
        name: p.nome,
        slug,
        config: p.config,
        requiredExpr: p.requiredExpr,
        visibleExpr: p.visibleExpr,
        defaultValueExpr: p.defaultValueExpr,
        uniqueValue: d.unico === true,
        helpText: d.ajuda?.trim() || null,
        position: (m ?? -1) + 1,
      })
      .returning();
    if (d.titulo) await tx.update(boards).set({ titleFieldId: f.id }).where(eq(boards.id, a.boardId));
    if ((p.config.relation as { exclusive?: boolean } | undefined)?.exclusive) await garantirIndiceExclusivo(tx, f.id);
    await registrar(tx, a, "field", "created", f.id, { slug, type: d.tipo, config: p.config });
    return f;
  });
}

export async function editarCampo(a: Alvo, fieldId: string, d: DadosCampo) {
  return db.transaction(async (tx) => {
    const b = await exigirBoardDoWs(tx, a);
    const [atual] = await tx.select().from(fields).where(and(eq(fields.id, fieldId), eq(fields.boardId, a.boardId), isNull(fields.archivedAt)));
    if (!atual) throw new ErroConfig("campo não encontrado");
    const ctx = await contextoConfig(tx, a);
    const p = prepararCampo(d, ctx);
    const slug = d.slug?.trim() || atual.slug;
    validarSlug(slug);
    if (slug !== atual.slug) {
      const [dup] = await tx.select({ id: fields.id }).from(fields).where(and(eq(fields.boardId, a.boardId), eq(fields.slug, slug), ne(fields.id, fieldId)));
      if (dup) throw new ErroConfig(`slug '${slug}' já existe neste board`);
    }
    const novo = {
      type: d.tipo as never,
      name: p.nome,
      slug,
      config: p.config,
      requiredExpr: p.requiredExpr,
      visibleExpr: p.visibleExpr,
      defaultValueExpr: p.defaultValueExpr,
      uniqueValue: d.unico === true,
      helpText: d.ajuda?.trim() || null,
    };
    await tx.update(fields).set(novo).where(eq(fields.id, fieldId));
    if (d.titulo && b.titleFieldId !== fieldId) await tx.update(boards).set({ titleFieldId: fieldId }).where(eq(boards.id, a.boardId));
    if ((p.config.relation as { exclusive?: boolean } | undefined)?.exclusive) await garantirIndiceExclusivo(tx, fieldId);
    await registrar(tx, a, "field", "updated", fieldId, {
      antes: { slug: atual.slug, type: atual.type, config: atual.config },
      depois: { slug, type: d.tipo, config: p.config },
    });
  });
}

/** Arquiva o campo (valores continuam em props; nada é apagado). */
export async function arquivarCampo(a: Alvo, fieldId: string) {
  return db.transaction(async (tx) => {
    const b = await exigirBoardDoWs(tx, a);
    if (b.titleFieldId === fieldId) throw new ErroConfig("não é possível arquivar o campo de título; escolha outro título antes");
    const [f] = await tx.update(fields).set({ archivedAt: new Date() }).where(and(eq(fields.id, fieldId), eq(fields.boardId, a.boardId))).returning();
    if (!f) throw new ErroConfig("campo não encontrado");
    await registrar(tx, a, "field", "archived", fieldId, { slug: f.slug });
  });
}

/** Ajuste do campo numa fase. null = herda o padrão do campo. */
export async function ajustarCampoNaFase(
  a: Alvo,
  fieldId: string,
  faseId: string,
  ajuste: { visible: boolean | null; editable: boolean | null; required: boolean | null },
) {
  return db.transaction(async (tx) => {
    await faseDoBoard(tx, a, faseId);
    const [f] = await tx.select({ id: fields.id }).from(fields).where(and(eq(fields.id, fieldId), eq(fields.boardId, a.boardId)));
    if (!f) throw new ErroConfig("campo não encontrado");
    if (ajuste.visible === null && ajuste.editable === null && ajuste.required === null) {
      await tx.delete(fieldPhaseSettings).where(and(eq(fieldPhaseSettings.fieldId, fieldId), eq(fieldPhaseSettings.phaseId, faseId)));
    } else {
      await tx
        .insert(fieldPhaseSettings)
        .values({ fieldId, phaseId: faseId, ...ajuste })
        .onConflictDoUpdate({ target: [fieldPhaseSettings.fieldId, fieldPhaseSettings.phaseId], set: ajuste });
    }
    await registrar(tx, a, "field_phase_settings", "updated", fieldId, { phase_id: faseId, ...ajuste });
  });
}

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

export const TIPOS_REGRA = ["can_create", "can_enter", "can_leave", "can_back", "can_edit", "can_delete"] as const;
export type TipoRegra = (typeof TIPOS_REGRA)[number];

export interface DadosRegra {
  kind: string;
  phaseId?: string | null;
  fieldId?: string | null;
  expr: string;
  message?: string;
  onFail?: "block" | "keep" | null;
  enabled?: boolean;
}

async function prepararRegra(tx: Tx, a: Alvo, d: DadosRegra) {
  if (!TIPOS_REGRA.includes(d.kind as TipoRegra)) throw new ErroConfig("tipo de regra inválido");
  const expr = validarExpr(d.expr, "expressão");
  if (!expr) throw new ErroConfig("expressão obrigatória");
  const phaseId = d.phaseId || null;
  if (phaseId) await faseDoBoard(tx, a, phaseId);
  const fieldId = d.kind === "can_edit" ? d.fieldId || null : null;
  if (fieldId) {
    const [f] = await tx.select({ id: fields.id }).from(fields).where(and(eq(fields.id, fieldId), eq(fields.boardId, a.boardId)));
    if (!f) throw new ErroConfig("campo da regra não encontrado");
  }
  return {
    kind: d.kind as TipoRegra,
    phaseId,
    fieldId,
    expr,
    message: d.message?.trim() || null,
    onFail: d.kind === "can_back" && d.onFail === "keep" ? { children: "keep" } : null,
  };
}

export async function criarRegra(a: Alvo, d: DadosRegra) {
  return db.transaction(async (tx) => {
    await exigirBoardDoWs(tx, a);
    const p = await prepararRegra(tx, a, d);
    const [{ m }] = await tx.select({ m: max(rules.position) }).from(rules).where(eq(rules.boardId, a.boardId));
    const [r] = await tx.insert(rules).values({ boardId: a.boardId, ...p, position: (m ?? -1) + 1 }).returning();
    await registrar(tx, a, "rule", "created", r.id, { kind: p.kind, expr: p.expr });
    return r;
  });
}

export async function editarRegra(a: Alvo, ruleId: string, d: DadosRegra) {
  return db.transaction(async (tx) => {
    await exigirBoardDoWs(tx, a);
    const [atual] = await tx.select().from(rules).where(and(eq(rules.id, ruleId), eq(rules.boardId, a.boardId)));
    if (!atual) throw new ErroConfig("regra não encontrada");
    const p = await prepararRegra(tx, a, d);
    const enabled = d.enabled ?? atual.enabled;
    await tx.update(rules).set({ ...p, enabled }).where(eq(rules.id, ruleId));
    await registrar(tx, a, "rule", "updated", ruleId, { antes: { expr: atual.expr, enabled: atual.enabled }, depois: { expr: p.expr, enabled } });
  });
}

/** Regras não são apagadas: desativar mantém o histórico de configuração. */
export async function ativarRegra(a: Alvo, ruleId: string, enabled: boolean) {
  return db.transaction(async (tx) => {
    await exigirBoardDoWs(tx, a);
    const [r] = await tx.update(rules).set({ enabled }).where(and(eq(rules.id, ruleId), eq(rules.boardId, a.boardId))).returning();
    if (!r) throw new ErroConfig("regra não encontrada");
    await registrar(tx, a, "rule", "updated", ruleId, { enabled });
  });
}

// ---------------------------------------------------------------------------
// Leitura para a tela de configurações
// ---------------------------------------------------------------------------

export async function dadosConfiguracao(wsId: string, boardId: string) {
  const [regras, ajustes, bs, relsParaCa] = await Promise.all([
    db.select().from(rules).where(eq(rules.boardId, boardId)).orderBy(asc(rules.position)),
    db
      .select({ fieldId: fieldPhaseSettings.fieldId, phaseId: fieldPhaseSettings.phaseId, visible: fieldPhaseSettings.visible, editable: fieldPhaseSettings.editable, required: fieldPhaseSettings.required })
      .from(fieldPhaseSettings)
      .innerJoin(fields, eq(fields.id, fieldPhaseSettings.fieldId))
      .where(eq(fields.boardId, boardId)),
    db.select({ id: boards.id, name: boards.name }).from(boards).where(and(eq(boards.workspaceId, wsId), isNull(boards.archivedAt))).orderBy(asc(boards.name)),
    db
      .select({ id: fields.id, name: fields.name, boardId: fields.boardId, boardName: boards.name })
      .from(fields)
      .innerJoin(boards, eq(boards.id, fields.boardId))
      .where(
        and(
          eq(fields.type, "relation"),
          isNull(fields.archivedAt),
          eq(boards.workspaceId, wsId),
          sql`${fields.config}->'relation'->>'target_board' = ${boardId}`,
          ne(fields.boardId, boardId),
        ),
      ),
  ]);
  return { regras, ajustes, boards: bs, relacoesEntrando: relsParaCa };
}

// ---------------------------------------------------------------------------
// Exibição do board (boards.settings)
// ---------------------------------------------------------------------------

/** Campos do cartão do kanban (até 3) e campo de prazo. Mescla em boards.settings. */
export async function definirExibicaoKanban(a: Alvo, dados: { campos: string[]; prazo: string | null }) {
  return db.transaction(async (tx) => {
    const b = await exigirBoardDoWs(tx, a);
    const campos = [...new Set(dados.campos)].slice(0, 3);
    const doBoard = await tx.select({ id: fields.id, type: fields.type }).from(fields).where(and(eq(fields.boardId, a.boardId), isNull(fields.archivedAt)));
    for (const id of campos) if (!doBoard.some((f) => f.id === id)) throw new ErroConfig("campo do cartão não pertence ao board");
    if (dados.prazo && !doBoard.some((f) => f.id === dados.prazo && (f.type === "date" || f.type === "datetime"))) {
      throw new ErroConfig("o prazo precisa ser um campo de data deste board");
    }
    const antes = (b.settings ?? {}) as Record<string, unknown>;
    const settings = { ...antes, kanban_fields: campos, kanban_due_field: dados.prazo || null };
    await tx.update(boards).set({ settings, updatedAt: new Date() }).where(eq(boards.id, a.boardId));
    await registrar(tx, a, "board", "updated", a.boardId, {
      antes: { kanban_fields: antes.kanban_fields ?? null, kanban_due_field: antes.kanban_due_field ?? null },
      depois: { kanban_fields: campos, kanban_due_field: settings.kanban_due_field },
    });
  });
}

/** Ajustes por fase (field_phase_settings) dos campos de um board, para formulários de criação. */
export async function ajustesDoBoard(boardId: string) {
  const rs = await db
    .select({ fieldId: fieldPhaseSettings.fieldId, phaseId: fieldPhaseSettings.phaseId, visible: fieldPhaseSettings.visible, editable: fieldPhaseSettings.editable, required: fieldPhaseSettings.required })
    .from(fieldPhaseSettings)
    .innerJoin(fields, eq(fields.id, fieldPhaseSettings.fieldId))
    .where(eq(fields.boardId, boardId));
  return rs.flatMap((a) => (a.fieldId && a.phaseId ? [{ ...a, fieldId: a.fieldId, phaseId: a.phaseId }] : []));
}
