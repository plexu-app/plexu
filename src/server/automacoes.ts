import "server-only";
// Configuração e operação de automações e ações pela UI (owner/admin configuram; membros executam ações).
// Validação do formato em src/lib/automacoes; aqui, as referências (fases, campos, boards) e os eventos
// config.changed. Execução pelo mesmo executor do worker (src/automacoes/executor).
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { actions, automationRuns, automations, boards, cards, connections, fields, phases, variables } from "@/db/schema";
import { avaliarNoCard, emitirEventoConfig, type Actor, type Tx } from "@/core";
import { executarRun } from "@/automacoes/executor";
import { gravarVariavel } from "@/automacoes/segredos";
import { ErroAutomacao, normalizarGatilho, normalizarPassos, type Gatilho, type Passo } from "@/lib/automacoes";
import { parse } from "@/lib/expr";
import { ErroConfig } from "./config";

interface Alvo {
  wsId: string;
  boardId: string;
  actor: Actor;
}

type Entidade = Parameters<typeof emitirEventoConfig>[2]["entidade"];
async function registrar(tx: Tx, a: { wsId: string; boardId: string | null; actor: Actor }, entidade: Entidade, acao: "created" | "updated" | "archived", id: string, dados?: Record<string, unknown>) {
  await emitirEventoConfig(tx, { workspaceId: a.wsId, boardId: a.boardId, actor: a.actor }, { entidade, acao, id, dados });
}

function exprOpcional(fonte: unknown, onde: string): string | null {
  const s = typeof fonte === "string" ? fonte.trim() : "";
  if (!s) return null;
  const r = parse(s);
  if (!r.ok) throw new ErroConfig(`${onde}: ${r.erro.mensagem}`);
  return s;
}

function comValidacao<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ErroAutomacao) throw new ErroConfig(e.message);
    throw e;
  }
}

/** Fases, campos e boards referenciados precisam existir e ser deste board/workspace. */
async function validarReferencias(tx: Tx, a: Alvo, gatilho: Gatilho | null, passos: Passo[]) {
  const [b] = await tx.select().from(boards).where(and(eq(boards.id, a.boardId), eq(boards.workspaceId, a.wsId)));
  if (!b) throw new ErroConfig("board não encontrado");
  const fasesDe = async (boardId: string) => new Set((await tx.select({ id: phases.id }).from(phases).where(and(eq(phases.boardId, boardId), isNull(phases.archivedAt)))).map((f) => f.id));
  const camposDe = async (boardId: string) => new Map((await tx.select().from(fields).where(and(eq(fields.boardId, boardId), isNull(fields.archivedAt)))).map((f) => [f.id, f]));
  const fases = await fasesDe(b.id);
  const campos = await camposDe(b.id);
  const boardsWs = new Set((await tx.select({ id: boards.id }).from(boards).where(and(eq(boards.workspaceId, a.wsId), isNull(boards.archivedAt)))).map((x) => x.id));
  const exigirFase = (id: string, onde: string) => {
    if (!fases.has(id)) throw new ErroConfig(`${onde}: fase não encontrada neste board`);
  };
  const exigirCampo = (id: string, onde: string) => {
    const c = campos.get(id);
    if (!c) throw new ErroConfig(`${onde}: campo não encontrado neste board`);
    return c;
  };

  if (gatilho) {
    if (gatilho.type === "card_entered_phase" || gatilho.type === "card_left_phase") exigirFase(gatilho.phase, "gatilho");
    if (gatilho.type === "field_updated") gatilho.fields.forEach((f) => exigirCampo(f, "gatilho"));
    if (gatilho.type === "scheduled" && "date_field" in gatilho) {
      const c = exigirCampo(gatilho.date_field, "gatilho");
      if (c.type !== "date" && c.type !== "datetime") throw new ErroConfig("gatilho: o campo precisa ser de data");
    }
    if (gatilho.type === "all_children_in_phase") {
      const [rel] = await tx.select().from(fields).where(and(eq(fields.id, gatilho.relation), eq(fields.type, "relation")));
      const alvo = String((rel?.config as { relation?: { target_board?: string } } | undefined)?.relation?.target_board ?? "");
      const filhos = rel?.boardId === b.id ? alvo : alvo === b.id ? rel?.boardId : null;
      if (!rel || !filhos || !boardsWs.has(filhos)) throw new ErroConfig("gatilho: relação com os filhos não encontrada");
      if (!(await fasesDe(filhos)).has(gatilho.phase)) throw new ErroConfig("gatilho: fase não é do board dos filhos");
    }
  }
  /** Board do outro lado de uma relação que liga este board (de qualquer lado). */
  const outroLado = async (relacao: string, onde: string) => {
    const [rel] = await tx.select().from(fields).where(and(eq(fields.id, relacao), eq(fields.type, "relation"), isNull(fields.archivedAt)));
    const alvo = String((rel?.config as { relation?: { target_board?: string } } | undefined)?.relation?.target_board ?? "");
    const outro = rel?.boardId === b.id ? alvo : alvo === b.id ? rel?.boardId : null;
    if (!rel || !outro || !boardsWs.has(outro)) throw new ErroConfig(`${onde}: a relação do alvo não liga este board a outro`);
    return outro;
  };
  for (const [i, p] of passos.entries()) {
    const onde = `passo ${i + 1}`;
    // Alvo pai/filhos: fase e campo são do board do outro lado da relação.
    const alvoBoard = "target" in p && p.target && p.target.type !== "self" ? await outroLado(p.target.relation, onde) : b.id;
    const fasesAlvo = alvoBoard === b.id ? fases : await fasesDe(alvoBoard);
    const camposAlvo = alvoBoard === b.id ? campos : await camposDe(alvoBoard);
    if (p.type === "move_card" && !fasesAlvo.has(p.phase)) throw new ErroConfig(`${onde}: fase não encontrada no board do card alvo`);
    if (p.type === "set_field") {
      const c = camposAlvo.get(p.field);
      if (!c) throw new ErroConfig(`${onde}: campo não encontrado no board do card alvo`);
      if (["rollup", "dynamic_text", "formula", "sequence"].includes(c.type)) throw new ErroConfig(`${onde}: o campo ${c.name} é calculado`);
    }
    if (p.type === "create_related_card") {
      if (!boardsWs.has(p.board)) throw new ErroConfig(`${onde}: board do novo card não encontrado`);
      if (p.phase && !(await fasesDe(p.board)).has(p.phase)) throw new ErroConfig(`${onde}: fase não é do board do novo card`);
      const doNovo = await camposDe(p.board);
      for (const k of Object.keys(p.fields)) if (!doNovo.has(k)) throw new ErroConfig(`${onde}: campo do novo card não encontrado`);
      if (p.relation) {
        const [rel] = await tx.select().from(fields).where(and(eq(fields.id, p.relation), eq(fields.type, "relation")));
        const alvo = String((rel?.config as { relation?: { target_board?: string } } | undefined)?.relation?.target_board ?? "");
        const liga = rel && ((rel.boardId === b.id && alvo === p.board) || (rel.boardId === p.board && alvo === b.id));
        if (!liga) throw new ErroConfig(`${onde}: a relação não liga este board ao board do novo card`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Automações
// ---------------------------------------------------------------------------

export interface DadosAutomacao {
  nome: string;
  trigger: unknown;
  condicao?: string;
  steps: unknown;
  env: "draft" | "test" | "published";
  suppress?: boolean;
  enabled?: boolean;
}

function prepararAutomacao(d: DadosAutomacao) {
  const nome = String(d.nome ?? "").trim();
  if (!nome) throw new ErroConfig("dê um nome à automação");
  const trigger = comValidacao(() => normalizarGatilho(d.trigger));
  const steps = comValidacao(() => normalizarPassos(d.steps));
  if (!steps.length) throw new ErroConfig("adicione ao menos um passo");
  if (!["draft", "test", "published"].includes(d.env)) throw new ErroConfig("ambiente inválido");
  return { nome, trigger, steps, condicao: exprOpcional(d.condicao, "condição"), env: d.env, suppress: d.suppress === true };
}

export async function salvarAutomacao(a: Alvo, id: string | null, d: DadosAutomacao) {
  const p = prepararAutomacao(d);
  return db.transaction(async (tx) => {
    await validarReferencias(tx, a, p.trigger, p.steps);
    const valores = { name: p.nome, trigger: p.trigger, conditionExpr: p.condicao, steps: p.steps, env: p.env, suppressTriggers: p.suppress, ...(d.enabled === undefined ? {} : { enabled: d.enabled }) };
    if (id) {
      const [atual] = await tx.select().from(automations).where(and(eq(automations.id, id), eq(automations.boardId, a.boardId), isNull(automations.archivedAt)));
      if (!atual) throw new ErroConfig("automação não encontrada");
      const publicou = p.env === "published" && atual.env !== "published";
      await tx.update(automations).set({ ...valores, ...(publicou ? { publishedVersion: atual.publishedVersion + 1 } : {}) }).where(eq(automations.id, id));
      await registrar(tx, a, "automation", "updated", id, { antes: { env: atual.env, trigger: atual.trigger, steps: atual.steps }, depois: { env: p.env, trigger: p.trigger, steps: p.steps } });
      return id;
    }
    const [row] = await tx
      .insert(automations)
      .values({ workspaceId: a.wsId, boardId: a.boardId, ...valores, publishedVersion: p.env === "published" ? 1 : 0 })
      .returning({ id: automations.id });
    await registrar(tx, a, "automation", "created", row.id, { name: p.nome, env: p.env });
    return row.id;
  });
}

export async function ativarAutomacao(a: Alvo, id: string, enabled: boolean) {
  return db.transaction(async (tx) => {
    const [r] = await tx.update(automations).set({ enabled }).where(and(eq(automations.id, id), eq(automations.boardId, a.boardId))).returning({ id: automations.id });
    if (!r) throw new ErroConfig("automação não encontrada");
    await registrar(tx, a, "automation", "updated", id, { enabled });
  });
}

export async function arquivarAutomacao(a: Alvo, id: string) {
  return db.transaction(async (tx) => {
    const [r] = await tx.update(automations).set({ archivedAt: new Date() }).where(and(eq(automations.id, id), eq(automations.boardId, a.boardId), isNull(automations.archivedAt))).returning({ id: automations.id });
    if (!r) throw new ErroConfig("automação não encontrada");
    await registrar(tx, a, "automation", "archived", id);
  });
}

/** Automações do board com a última execução. */
export async function automacoesDoBoard(boardId: string) {
  const lista = await db.select().from(automations).where(and(eq(automations.boardId, boardId), isNull(automations.archivedAt))).orderBy(automations.createdAt);
  if (!lista.length) return [];
  const ultimas = await db.execute<{ automation_id: string; status: string; created_at: string; error: string | null }>(sql`
    select distinct on (automation_id) automation_id, status, created_at, error from automation_runs
    where automation_id in (${sql.join(lista.map((x) => sql`${x.id}`), sql`, `)})
    order by automation_id, created_at desc`);
  const porId = new Map(ultimas.map((u) => [u.automation_id, u]));
  return lista.map((x) => {
    const u = porId.get(x.id);
    return {
      id: x.id,
      nome: x.name,
      trigger: x.trigger as Record<string, unknown>,
      condicao: x.conditionExpr ?? "",
      steps: (x.steps ?? []) as Record<string, unknown>[],
      env: x.env,
      suppress: x.suppressTriggers,
      enabled: x.enabled,
      ultima: u ? { status: u.status, quando: new Date(u.created_at).toISOString(), erro: u.error } : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Execuções (teste com card, listagem, reexecução)
// ---------------------------------------------------------------------------

async function exigirCardDoBoard(boardId: string, cardId: string) {
  const [c] = await db.select({ id: cards.id }).from(cards).where(and(eq(cards.id, cardId), eq(cards.boardId, boardId), isNull(cards.deletedAt)));
  if (!c) throw new ErroConfig("card não encontrado neste board");
}

async function lerRun(id: string) {
  const [r] = await db.select().from(automationRuns).where(eq(automationRuns.id, id));
  return r;
}

/** Roda a automação no card em modo teste (simulação: nada é gravado; e-mail/HTTP simulados). */
export async function testarAutomacao(a: Alvo, automationId: string, cardId: string) {
  const [x] = await db.select().from(automations).where(and(eq(automations.id, automationId), eq(automations.boardId, a.boardId), isNull(automations.archivedAt)));
  if (!x) throw new ErroConfig("automação não encontrada");
  await exigirCardDoBoard(a.boardId, cardId);
  const [run] = await db
    .insert(automationRuns)
    .values({ automationId, workspaceId: a.wsId, cardId, status: "queued", env: "test", context: { manual: true, usuario: a.actor.id } })
    .returning({ id: automationRuns.id });
  await executarRun(run.id);
  return lerRun(run.id);
}

export interface FiltroExecucoes {
  automacao?: string;
  acao?: string;
  status?: string;
  limite?: number;
}

/** Execuções das automações e ações do board, mais recentes primeiro. */
export async function execucoesDoBoard(boardId: string, f: FiltroExecucoes = {}) {
  const autos = await db.select({ id: automations.id, nome: automations.name }).from(automations).where(eq(automations.boardId, boardId));
  const acs = await db.select({ id: actions.id, nome: actions.name }).from(actions).where(eq(actions.boardId, boardId));
  const nomes = new Map([...autos, ...acs].map((x) => [x.id, x.nome]));
  // Filtro por automação exclui as ações e vice-versa.
  const idsAuto = f.acao ? [] : autos.map((x) => x.id).filter((id) => !f.automacao || id === f.automacao);
  const idsAcao = f.automacao ? [] : acs.map((x) => x.id).filter((id) => !f.acao || id === f.acao);
  const origens = [...(idsAuto.length ? [inArray(automationRuns.automationId, idsAuto)] : []), ...(idsAcao.length ? [inArray(automationRuns.actionId, idsAcao)] : [])];
  if (!origens.length) return [];
  const rows = await db
    .select({ run: automationRuns, titulo: cards.title })
    .from(automationRuns)
    .leftJoin(cards, eq(cards.id, automationRuns.cardId))
    .where(and(or(...origens), ...(f.status ? [eq(automationRuns.status, f.status as "queued")] : [])))
    .orderBy(desc(automationRuns.createdAt))
    .limit(Math.min(f.limite ?? 100, 500));
  return rows.map(({ run, titulo }) => ({
    id: run.id,
    origem: run.automationId ? ("automacao" as const) : ("acao" as const),
    nome: nomes.get(run.automationId ?? run.actionId ?? "") ?? "—",
    cardId: run.cardId,
    card: titulo,
    status: run.status,
    env: run.env,
    tentativa: run.attempt,
    erro: run.error,
    log: run.log as unknown[],
    quando: run.createdAt.toISOString(),
    gatilho: (run.context as { gatilho?: string; manual?: boolean }).manual ? "manual" : ((run.context as { gatilho?: string }).gatilho ?? (run.actionId ? "botão" : "—")),
  }));
}

/** Nova execução igual a uma anterior (mesma automação/ação, card e contexto), executada agora. */
export async function reexecutar(a: Alvo, runId: string) {
  const [r] = await db.select().from(automationRuns).where(eq(automationRuns.id, runId));
  const ok = r && (r.automationId ? (await db.select({ id: automations.id }).from(automations).where(and(eq(automations.id, r.automationId), eq(automations.boardId, a.boardId)))).length : (await db.select({ id: actions.id }).from(actions).where(and(eq(actions.id, r.actionId!), eq(actions.boardId, a.boardId)))).length);
  if (!ok) throw new ErroConfig("execução não encontrada");
  const [novo] = await db
    .insert(automationRuns)
    .values({
      automationId: r.automationId,
      actionId: r.actionId,
      workspaceId: a.wsId,
      cardId: r.cardId,
      triggerEventId: r.triggerEventId,
      env: r.env,
      status: "queued",
      context: { ...(r.context as object), reexecucao_de: r.id, usuario: (r.context as { usuario?: string }).usuario ?? a.actor.id },
    })
    .returning({ id: automationRuns.id });
  await executarRun(novo.id);
  return lerRun(novo.id);
}

// ---------------------------------------------------------------------------
// Ações (botão no card)
// ---------------------------------------------------------------------------

export interface CampoFormAcao {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean";
  required?: boolean;
}

export interface DadosAcao {
  nome: string;
  visivel?: string;
  form?: CampoFormAcao[];
  steps: unknown;
  runAs?: "user" | "system";
  enabled?: boolean;
}

function prepararAcao(d: DadosAcao) {
  const nome = String(d.nome ?? "").trim();
  if (!nome) throw new ErroConfig("dê um nome à ação");
  const steps = comValidacao(() => normalizarPassos(d.steps));
  if (!steps.length) throw new ErroConfig("adicione ao menos um passo");
  const form = (Array.isArray(d.form) ? d.form : []).map((c, i) => {
    const key = String(c.key ?? "").trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new ErroConfig(`campo ${i + 1} do formulário: identificador inválido (letras, números e _)`);
    if (!["text", "number", "date", "boolean"].includes(c.type)) throw new ErroConfig(`campo ${i + 1} do formulário: tipo inválido`);
    return { key, label: String(c.label ?? "").trim() || key, type: c.type, required: c.required === true };
  });
  if (new Set(form.map((c) => c.key)).size !== form.length) throw new ErroConfig("formulário com identificadores repetidos");
  return { nome, steps, form, visivel: exprOpcional(d.visivel, "visível quando"), runAs: d.runAs === "system" ? ("system" as const) : ("user" as const) };
}

export async function salvarAcao(a: Alvo, id: string | null, d: DadosAcao) {
  const p = prepararAcao(d);
  return db.transaction(async (tx) => {
    await validarReferencias(tx, a, null, p.steps);
    const valores = { name: p.nome, steps: p.steps, formSchema: p.form.length ? p.form : null, visibleExpr: p.visivel, runAs: p.runAs, ...(d.enabled === undefined ? {} : { enabled: d.enabled }) };
    if (id) {
      const [r] = await tx.update(actions).set(valores).where(and(eq(actions.id, id), eq(actions.boardId, a.boardId), isNull(actions.archivedAt))).returning({ id: actions.id });
      if (!r) throw new ErroConfig("ação não encontrada");
      await registrar(tx, a, "action", "updated", id, { name: p.nome, steps: p.steps });
      return id;
    }
    const [r] = await tx.insert(actions).values({ boardId: a.boardId, ...valores }).returning({ id: actions.id });
    await registrar(tx, a, "action", "created", r.id, { name: p.nome });
    return r.id;
  });
}

export async function arquivarAcao(a: Alvo, id: string) {
  return db.transaction(async (tx) => {
    const [r] = await tx.update(actions).set({ archivedAt: new Date() }).where(and(eq(actions.id, id), eq(actions.boardId, a.boardId), isNull(actions.archivedAt))).returning({ id: actions.id });
    if (!r) throw new ErroConfig("ação não encontrada");
    await registrar(tx, a, "action", "archived", id);
  });
}

export async function acoesDoBoard(boardId: string) {
  const lista = await db.select().from(actions).where(and(eq(actions.boardId, boardId), isNull(actions.archivedAt))).orderBy(actions.name);
  return lista.map((x) => ({
    id: x.id,
    nome: x.name,
    visivel: x.visibleExpr ?? "",
    form: (x.formSchema ?? []) as CampoFormAcao[],
    steps: x.steps as Record<string, unknown>[],
    runAs: x.runAs,
    enabled: x.enabled,
  }));
}

/** Ações ativas visíveis no card (visible_expr avaliada no card; erro de expressão esconde). */
export async function acoesDoCard(boardId: string, cardId: string, actor: Actor) {
  const lista = (await acoesDoBoard(boardId)).filter((x) => x.enabled);
  const visiveis = [];
  for (const x of lista) {
    if (x.visivel) {
      try {
        const [v] = await avaliarNoCard({ cardId, boardId, exprs: [x.visivel], actor });
        if (v !== true) continue;
      } catch {
        continue;
      }
    }
    visiveis.push({ id: x.id, nome: x.nome, form: x.form });
  }
  return visiveis;
}

/** Executa a ação no card agora (mesmo executor das automações), com os valores do mini-form. */
export async function executarAcao(a: { wsId: string; boardId: string; actor: Actor }, actionId: string, cardId: string, form: Record<string, unknown>) {
  const visiveis = await acoesDoCard(a.boardId, cardId, a.actor);
  const acao = visiveis.find((x) => x.id === actionId);
  if (!acao) throw new ErroConfig("ação indisponível neste card");
  const valores: Record<string, unknown> = {};
  for (const c of acao.form) {
    const bruto = form[c.key];
    const vazio = bruto === undefined || bruto === null || bruto === "";
    if (c.required && vazio && c.type !== "boolean") throw new ErroConfig(`preencha ${c.label}`);
    valores[c.key] =
      c.type === "boolean" ? bruto === true || bruto === "on" || bruto === "true" : vazio ? null : c.type === "number" ? Number(String(bruto).replace(",", ".")) : String(bruto);
    if (c.type === "number" && valores[c.key] !== null && !Number.isFinite(valores[c.key])) throw new ErroConfig(`${c.label}: número inválido`);
  }
  const [run] = await db
    .insert(automationRuns)
    .values({ actionId, workspaceId: a.wsId, cardId, status: "queued", env: "published", context: { usuario: a.actor.id, form: valores } })
    .returning({ id: automationRuns.id });
  await executarRun(run.id);
  return lerRun(run.id);
}

// ---------------------------------------------------------------------------
// Variáveis e SMTP do workspace
// ---------------------------------------------------------------------------

export async function variaveisDoWorkspace(wsId: string) {
  const rows = await db.select().from(variables).where(eq(variables.workspaceId, wsId)).orderBy(variables.key);
  // Segredo nunca volta para a UI.
  return rows.map((r) => ({ key: r.key, value: r.isSecret ? "" : r.value, secreta: r.isSecret }));
}

export async function salvarVariavel(a: { wsId: string; actor: Actor }, key: string, value: string, secreta: boolean) {
  const k = key.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new ErroConfig("nome da variável: letras, números e _ (sem espaço)");
  await db.transaction(async (tx) => {
    const [atual] = await tx.select().from(variables).where(and(eq(variables.workspaceId, a.wsId), eq(variables.key, k)));
    // Secreta existente com valor vazio: mantém o segredo (a UI não o conhece).
    if (atual?.isSecret && secreta && !value) return;
    await gravarVariavel(a.wsId, k, value, secreta, tx);
    await registrar(tx, { ...a, boardId: null }, "variable", atual ? "updated" : "created", k, { key: k, secreta });
  });
}

export async function removerVariavel(a: { wsId: string; actor: Actor }, key: string) {
  await db.transaction(async (tx) => {
    const r = await tx.delete(variables).where(and(eq(variables.workspaceId, a.wsId), eq(variables.key, key))).returning({ key: variables.key });
    if (r.length) await registrar(tx, { ...a, boardId: null }, "variable", "archived", key, { key });
  });
}

export interface DadosSmtp {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  /** Vazio mantém a senha atual. */
  senha: string;
}

export async function smtpDoWorkspaceUI(wsId: string) {
  const [c] = await db.select().from(connections).where(and(eq(connections.workspaceId, wsId), eq(connections.type, "smtp"))).limit(1);
  if (!c) return null;
  const cfg = c.config as Record<string, unknown>;
  return { host: String(cfg.host ?? ""), port: Number(cfg.port ?? 587), secure: cfg.secure === true, user: String(cfg.user ?? ""), from: String(cfg.from ?? ""), temSenha: !!c.secretRef };
}

export async function salvarSmtp(a: { wsId: string; actor: Actor }, d: DadosSmtp) {
  const host = d.host.trim();
  const from = d.from.trim();
  if (!host) throw new ErroConfig("informe o servidor SMTP");
  if (!/^[^\s@]+@[^\s@]+$/.test(from.replace(/^.*<(.+)>$/, "$1"))) throw new ErroConfig("remetente inválido");
  const port = Number(d.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ErroConfig("porta inválida");
  await db.transaction(async (tx) => {
    const [atual] = await tx.select().from(connections).where(and(eq(connections.workspaceId, a.wsId), eq(connections.type, "smtp"))).limit(1);
    let secretRef = atual?.secretRef ?? null;
    if (d.senha) {
      secretRef = "SMTP_SENHA";
      await gravarVariavel(a.wsId, secretRef, d.senha, true, tx);
    }
    const config = { host, port, secure: d.secure === true, user: d.user.trim(), from };
    if (atual) await tx.update(connections).set({ config, secretRef }).where(eq(connections.id, atual.id));
    else await tx.insert(connections).values({ workspaceId: a.wsId, name: "SMTP", type: "smtp", config, secretRef });
    await registrar(tx, { ...a, boardId: null }, "connection", atual ? "updated" : "created", atual?.id ?? "smtp", { host, port, from });
  });
}

/** Boards do workspace (campos e fases) e relações que ligam este board a outros: base dos editores. */
export async function estruturaParaAutomacoes(wsId: string, boardId: string) {
  const bs = await db.select({ id: boards.id, name: boards.name }).from(boards).where(and(eq(boards.workspaceId, wsId), isNull(boards.archivedAt))).orderBy(boards.name);
  const ids = bs.map((b) => b.id);
  const fs = ids.length ? await db.select().from(fields).where(and(inArray(fields.boardId, ids), isNull(fields.archivedAt))).orderBy(fields.position) : [];
  const ps = ids.length ? await db.select().from(phases).where(and(inArray(phases.boardId, ids), isNull(phases.archivedAt))).orderBy(phases.position) : [];
  const nome = new Map(bs.map((b) => [b.id, b.name]));
  const estrutura = bs.map((b) => ({
    id: b.id,
    name: b.name,
    campos: fs.filter((f) => f.boardId === b.id).map((f) => ({ id: f.id, slug: f.slug, name: f.name, type: f.type })),
    fases: ps.filter((p) => p.boardId === b.id).map((p) => ({ id: p.id, name: p.name })),
  }));
  const relacoes = fs
    .filter((f) => f.type === "relation")
    .flatMap((f) => {
      const alvo = String((f.config as { relation?: { target_board?: string } }).relation?.target_board ?? "");
      if (f.boardId === boardId && alvo && nome.has(alvo)) return [{ id: f.id, rotulo: `${f.name} (${nome.get(alvo)})`, outro: alvo }];
      if (alvo === boardId && f.boardId !== boardId) return [{ id: f.id, rotulo: `${nome.get(f.boardId)} · ${f.name}`, outro: f.boardId }];
      return [];
    });
  return { boards: estrutura, relacoes };
}
