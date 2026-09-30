// Executor de execuções (automações e ações): condição → passos em sequência, parando no primeiro erro.
// Tudo numa transação, marcada com plexu.run_id (os eventos gerados carregam a execução: cascata e
// proteção contra loop). Escrita em cards só pelo core. Ambiente "test" = simulação: a transação é
// desfeita no fim e e-mail/HTTP não saem.
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { actions, automationRuns, automations, boards, cards, fields } from "../db/schema";
import { addComment, avaliarNoCard, CoreError, createCard, linkCards, moveCard, updateFields, type Actor, type Tx } from "../core";
import { normalizarPassos, textoDoValor, trechosModelo, type Alvo, type Passo } from "../lib/automacoes";
import { ExprError, type Registro } from "../lib/expr";
import { efeitosReais, ErroTransitorio, type Efeitos } from "./efeitos";
import { lerVariaveis, mascarar, smtpDoWorkspace, type Smtp, type Variaveis } from "./segredos";

export const MAX_TENTATIVAS = 3;

export interface ItemLog {
  passo: number | null;
  tipo: string;
  status: "ok" | "erro" | "simulado" | "nao_enviado" | "info";
  mensagem?: string;
  detalhe?: Record<string, unknown>;
  ms?: number;
}

export type ResultadoExecucao = { status: "success" | "failed" | "skipped" | "dead" | "queued"; log: ItemLog[]; erro?: string; reenfileirarEm?: number };

/** Erro de configuração/dado de um passo (não adianta repetir). */
class ErroPasso extends Error {}
class Simulacao extends Error {}

interface Contexto {
  tx: Tx;
  runId: string;
  workspaceId: string;
  boardId: string;
  cardId: string | null;
  actor: Actor;
  teste: boolean;
  form: Registro | null;
  faseOrigem: string | null;
  faseDestino: string | null;
  vars: Variaveis;
  smtp: Smtp | null;
  efeitos: Efeitos;
}

async function avaliar(ctx: Contexto, exprs: string[]): Promise<unknown[]> {
  return avaliarNoCard(
    { cardId: ctx.cardId, boardId: ctx.boardId, exprs, actor: ctx.actor, faseOrigem: ctx.faseOrigem, faseDestino: ctx.faseDestino, form: ctx.form },
    { tx: ctx.tx },
  );
}

/** Renderiza um modelo {{ }}: CEL no contexto do card; var.NOME das variáveis do workspace. */
async function renderizar(ctx: Contexto, modelo: string): Promise<string> {
  const trechos = trechosModelo(modelo ?? "");
  const exprs = trechos.filter((t) => t.tipo === "expr").map((t) => t.valor);
  const valores = await avaliar(ctx, exprs);
  let i = 0;
  return trechos
    .map((t) => {
      if (t.tipo === "texto") return t.valor;
      if (t.tipo === "expr") return textoDoValor(valores[i++]);
      const v = ctx.vars.valores.get(t.valor);
      if (v === undefined) throw new ErroPasso(`variável ${t.valor} não definida no workspace`);
      return v;
    })
    .join("");
}

const exigirCard = (ctx: Contexto) => {
  if (!ctx.cardId) throw new ErroPasso("este passo precisa de um card (gatilho sem card)");
  return ctx.cardId;
};

/**
 * Cards em que o passo age: o do gatilho, ou os ligados a ele pela relação no papel pedido — mesmo
 * sentido de pai/pais()/filhos() nas expressões. Ligações e cards excluídos não contam.
 */
async function alvosDoPasso(ctx: Contexto, alvo: Alvo | undefined): Promise<string[]> {
  const eu = exigirCard(ctx);
  if (!alvo || alvo.type === "self") return [eu];
  const [rel] = await ctx.tx.select({ config: fields.config, type: fields.type }).from(fields).where(eq(fields.id, alvo.relation));
  if (rel?.type !== "relation") throw new ErroPasso("relação do alvo não encontrada");
  const isParent = (rel.config as { relation?: { is_parent?: boolean } }).relation?.is_parent === true;
  // Destinos (origem = este card) são pais numa relação is_parent e filhos numa relação comum.
  const destinos = isParent === (alvo.type === "parent");
  const rows = await ctx.tx.execute<{ id: string }>(
    destinos
      ? sql`select l.to_card_id as id from card_links l join cards c on c.id = l.to_card_id
            where l.field_id = ${alvo.relation} and l.from_card_id = ${eu} and l.deleted_at is null and c.deleted_at is null order by c.created_at`
      : sql`select l.from_card_id as id from card_links l join cards c on c.id = l.from_card_id
            where l.field_id = ${alvo.relation} and l.to_card_id = ${eu} and l.deleted_at is null and c.deleted_at is null order by c.created_at`,
  );
  return [...new Set(rows.map((r) => r.id))].filter((id) => id !== eu);
}

const semAlvo = (alvo: Alvo | undefined) => ({ status: "info" as const, mensagem: `nenhum card ${alvo?.type === "parent" ? "pai" : "filho"} ligado: nada a fazer` });
const detalheAlvo = (alvo: Alvo | undefined, ids: string[]) => (alvo && alvo.type !== "self" ? { alvo: alvo.type === "parent" ? "pai" : "filhos", cards: ids } : {});

async function executarPasso(ctx: Contexto, p: Passo): Promise<Omit<ItemLog, "passo" | "tipo" | "ms">> {
  const m = (s: string) => mascarar(s, ctx.vars.segredos);
  switch (p.type) {
    case "move_card": {
      const alvos = await alvosDoPasso(ctx, p.target);
      if (!alvos.length) return semAlvo(p.target);
      for (const id of alvos) await moveCard({ cardId: id, toPhaseId: p.phase, actor: ctx.actor }, { tx: ctx.tx });
      return { status: "ok", detalhe: { fase: p.phase, ...detalheAlvo(p.target, alvos) } };
    }
    case "set_field": {
      const alvos = await alvosDoPasso(ctx, p.target);
      if (!alvos.length) return semAlvo(p.target);
      const valor = p.expr ? (await avaliar(ctx, [p.expr]))[0] : (p.value ?? null);
      for (const id of alvos) await updateFields({ cardId: id, props: { [p.field]: valor }, actor: ctx.actor }, { tx: ctx.tx });
      return { status: "ok", detalhe: { campo: p.field, valor, ...detalheAlvo(p.target, alvos) } };
    }
    case "create_related_card": {
      const [b] = await ctx.tx.select({ workspaceId: boards.workspaceId }).from(boards).where(eq(boards.id, p.board));
      if (b?.workspaceId !== ctx.workspaceId) throw new ErroPasso("board do novo card não encontrado neste workspace");
      const chaves = Object.keys(p.fields);
      const valores = await avaliar(ctx, chaves.map((k) => p.fields[k]));
      const props: Record<string, unknown> = Object.fromEntries(chaves.map((k, i) => [k, valores[i]]));
      let ligarDepois: string | null = null;
      if (p.relation) {
        const origem = exigirCard(ctx);
        const [rel] = await ctx.tx.select({ boardId: fields.boardId, type: fields.type }).from(fields).where(eq(fields.id, p.relation));
        if (rel?.type !== "relation") throw new ErroPasso("relação do novo card não encontrada");
        if (rel.boardId === p.board) props[p.relation] = [origem]; // relação no board novo: o novo card aponta para o do gatilho
        else ligarDepois = p.relation; // relação no board do gatilho: o card do gatilho aponta para o novo
      }
      const novo = await createCard({ boardId: p.board, phaseId: p.phase ?? undefined, props, actor: ctx.actor }, { tx: ctx.tx });
      if (ligarDepois) await linkCards({ fieldId: ligarDepois, fromCardId: ctx.cardId!, toCardId: novo.id, actor: ctx.actor }, { tx: ctx.tx });
      return { status: "ok", detalhe: { card: novo.id, titulo: novo.title } };
    }
    case "add_comment": {
      const alvos = await alvosDoPasso(ctx, p.target);
      if (!alvos.length) return semAlvo(p.target);
      const body = await renderizar(ctx, p.body);
      for (const id of alvos) await addComment({ cardId: id, body, actor: ctx.actor }, { tx: ctx.tx });
      return { status: "ok", detalhe: { comentario: m(body), ...detalheAlvo(p.target, alvos) } };
    }
    case "send_email": {
      const [to, subject, text] = [await renderizar(ctx, p.to), await renderizar(ctx, p.subject), await renderizar(ctx, p.body)];
      const detalhe = { para: m(to), assunto: m(subject), corpo: m(text).slice(0, 2000) };
      if (!to.trim()) throw new ErroPasso("destinatário vazio");
      if (ctx.teste) return { status: "simulado", mensagem: "ambiente de teste: e-mail não enviado", detalhe };
      if (!ctx.smtp) return { status: "nao_enviado", mensagem: "workspace sem SMTP configurado: e-mail não enviado", detalhe };
      const r = await ctx.efeitos.email(ctx.smtp, { to, subject, text });
      return { status: "ok", detalhe: { ...detalhe, id: r.id } };
    }
    case "http_request": {
      const url = await renderizar(ctx, p.url);
      if (!/^https?:\/\//i.test(url)) throw new ErroPasso(`URL inválida: ${m(url)}`);
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(p.headers ?? {})) headers[k] = await renderizar(ctx, v);
      const body = p.body ? await renderizar(ctx, p.body) : undefined;
      const requisicao = { metodo: p.method, url: m(url), headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, m(v)])), corpo: body ? m(body).slice(0, 2000) : undefined };
      if (ctx.teste) return { status: "simulado", mensagem: "ambiente de teste: requisição não enviada", detalhe: { requisicao } };
      const r = await ctx.efeitos.http({ method: p.method, url, headers, body });
      const resposta = { status: r.status, headers: r.headers, corpo: m(r.body) };
      if (r.status >= 500 || r.status === 429) throw new ErroTransitorio(`HTTP ${r.status}`, { cause: { requisicao, resposta } });
      if (r.status >= 400) throw Object.assign(new ErroPasso(`HTTP ${r.status}`), { detalhe: { requisicao, resposta } });
      return { status: "ok", detalhe: { requisicao, resposta } };
    }
  }
}

const transitorio = (e: unknown) => {
  if (e instanceof ErroTransitorio) return true;
  const code = ((e as { cause?: { code?: string } })?.cause ?? (e as { code?: string }))?.code;
  return code === "40001" || code === "40P01";
};

function mensagemDe(e: unknown): string {
  if (e instanceof CoreError || e instanceof ErroPasso || e instanceof ErroTransitorio) return e.message;
  if (e instanceof ExprError) return `expressão: ${e.message}`;
  return (e as Error)?.message ?? String(e);
}

export interface ExecutarEntrada {
  runId: string;
  workspaceId: string;
  boardId: string;
  cardId: string | null;
  actor: Actor;
  teste: boolean;
  condicao: string | null;
  passos: Passo[];
  form?: Registro | null;
  faseOrigem?: string | null;
  faseDestino?: string | null;
  efeitos?: Efeitos;
}

/**
 * Condição e passos numa transação marcada com a execução. Devolve o log; não grava a execução
 * (o chamador atualiza automation_runs). Erros viram status; transitórios são sinalizados.
 */
export async function executarPassos(e: ExecutarEntrada): Promise<{ status: "success" | "failed" | "skipped"; log: ItemLog[]; erro?: string; transitorio?: boolean }> {
  const log: ItemLog[] = [];
  const vars = await lerVariaveis(e.workspaceId);
  const smtp = await smtpDoWorkspace(e.workspaceId, vars);
  let pulou = false;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('plexu.run_id', ${e.runId}, true)`);
      const ctx: Contexto = {
        tx,
        runId: e.runId,
        workspaceId: e.workspaceId,
        boardId: e.boardId,
        cardId: e.cardId,
        actor: e.actor,
        teste: e.teste,
        form: e.form ?? null,
        faseOrigem: e.faseOrigem ?? null,
        faseDestino: e.faseDestino ?? null,
        vars,
        smtp,
        efeitos: e.efeitos ?? efeitosReais,
      };
      if (e.condicao?.trim()) {
        const [ok] = await avaliar(ctx, [e.condicao]);
        log.push({ passo: null, tipo: "condicao", status: "info", mensagem: ok === true ? "condição verdadeira" : "condição falsa: nada a fazer" });
        if (ok !== true) {
          pulou = true;
          return;
        }
      }
      for (const [i, p] of e.passos.entries()) {
        const t0 = Date.now();
        try {
          const r = await executarPasso(ctx, p);
          log.push({ passo: i + 1, tipo: p.type, ms: Date.now() - t0, ...r });
        } catch (err) {
          const detalhe = (err as { detalhe?: Record<string, unknown> }).detalhe ?? ((err as { cause?: unknown }).cause as Record<string, unknown> | undefined);
          log.push({ passo: i + 1, tipo: p.type, status: "erro", mensagem: mascarar(mensagemDe(err), vars.segredos), ms: Date.now() - t0, ...(detalhe && typeof detalhe === "object" ? { detalhe } : {}) });
          throw Object.assign(err as object, { passoFalhou: i + 1, tipoPasso: p.type });
        }
      }
      if (e.teste) throw new Simulacao();
    });
  } catch (err) {
    if (err instanceof Simulacao) {
      log.push({ passo: null, tipo: "simulacao", status: "info", mensagem: "ambiente de teste: alterações desfeitas; e-mail e HTTP simulados" });
      return { status: "success", log };
    }
    const f = err as { passoFalhou?: number; tipoPasso?: string };
    const erro = mascarar(f.passoFalhou ? `passo ${f.passoFalhou} (${f.tipoPasso}): ${mensagemDe(err)}` : mensagemDe(err), vars.segredos);
    if (!f.passoFalhou) log.push({ passo: null, tipo: "erro", status: "erro", mensagem: erro });
    return { status: "failed", log, erro, transitorio: transitorio(err) };
  }
  return { status: pulou ? "skipped" : "success", log };
}

// ---------------------------------------------------------------------------
// Execução de um automation_run
// ---------------------------------------------------------------------------

async function finalizar(runId: string, r: ResultadoExecucao) {
  await db
    .update(automationRuns)
    .set({ status: r.status, log: r.log, error: r.erro ?? null, finishedAt: r.status === "queued" ? null : new Date(), ...(r.status === "queued" ? { startedAt: null } : {}) })
    .where(eq(automationRuns.id, runId));
  return r;
}

/**
 * Executa uma execução "queued" (reivindica com status running; outra instância que chegue depois não
 * faz nada). Falha transitória volta para a fila com backoff até MAX_TENTATIVAS; depois fica "dead".
 */
export async function executarRun(runId: string, opcoes: { efeitos?: Efeitos } = {}): Promise<ResultadoExecucao | null> {
  const [run] = await db
    .update(automationRuns)
    .set({ status: "running", startedAt: new Date() })
    .where(sql`${automationRuns.id} = ${runId} and ${automationRuns.status} = 'queued'`)
    .returning();
  if (!run) return null;
  const pular = (mensagem: string) => finalizar(run.id, { status: "skipped", log: [{ passo: null, tipo: "info", status: "info", mensagem }], erro: mensagem });
  const ctxRun = run.context as { fase_origem?: string | null; fase_destino?: string | null; form?: Registro; usuario?: string };

  let base: Omit<ExecutarEntrada, "runId" | "teste" | "cardId" | "efeitos">;
  if (run.automationId) {
    const [a] = await db.select().from(automations).where(eq(automations.id, run.automationId));
    if (!a || a.archivedAt || !a.enabled || (a.env === "draft" && !ctxRun.usuario)) return pular("automação desativada, arquivada ou em rascunho");
    if (!a.boardId) return pular("automação sem board");
    let passos: Passo[];
    try {
      passos = normalizarPassos(a.steps);
    } catch (e) {
      return finalizar(run.id, { status: "failed", log: [], erro: `configuração inválida: ${(e as Error).message}` });
    }
    base = { workspaceId: a.workspaceId, boardId: a.boardId, actor: { type: "automation", id: a.id }, condicao: a.conditionExpr, passos };
  } else {
    const [ac] = await db.select({ ac: actions, workspaceId: boards.workspaceId }).from(actions).innerJoin(boards, eq(boards.id, actions.boardId)).where(eq(actions.id, run.actionId!));
    if (!ac || ac.ac.archivedAt || !ac.ac.enabled) return pular("ação desativada ou arquivada");
    const actor: Actor = ac.ac.runAs === "system" || !ctxRun.usuario ? { type: "system", id: null } : { type: "user", id: ctxRun.usuario };
    base = { workspaceId: ac.workspaceId, boardId: ac.ac.boardId, actor, condicao: null, passos: normalizarPassos(ac.ac.steps), form: ctxRun.form ?? null };
  }
  if (run.cardId) {
    const [c] = await db.select({ deletedAt: cards.deletedAt }).from(cards).where(eq(cards.id, run.cardId));
    if (!c || c.deletedAt) return pular("card excluído");
  }

  const r = await executarPassos({
    ...base,
    runId: run.id,
    cardId: run.cardId,
    teste: run.env === "test",
    faseOrigem: ctxRun.fase_origem ?? null,
    faseDestino: ctxRun.fase_destino ?? null,
    efeitos: opcoes.efeitos,
  });
  if (r.status === "failed" && r.transitorio) {
    if (run.attempt < MAX_TENTATIVAS) {
      await db.update(automationRuns).set({ attempt: run.attempt + 1 }).where(eq(automationRuns.id, run.id));
      return finalizar(run.id, { status: "queued", log: r.log, erro: r.erro, reenfileirarEm: 30 * 2 ** (run.attempt - 1) });
    }
    return finalizar(run.id, { status: "dead", log: r.log, erro: `${r.erro} (após ${run.attempt} tentativas)` });
  }
  return finalizar(run.id, { status: r.status, log: r.log, erro: r.erro });
}
