// Regras de transição/edição (tabela rules) e montagem do contexto das expressões.
// Toda regra é avaliada no servidor, antes da escrita, para qualquer canal.
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { cards, rules, users } from "../db/schema";
import { compile, type ExprCompilada, type ExprContext, type Registro } from "../lib/expr";
import {
  acharBoardId,
  ajuste,
  carregarQuadro,
  configRelacao,
  dataNoFuso,
  lerCards,
  lerLigacoes,
  RASCUNHO,
  registro,
  TIPOS_SOMENTE_LEITURA,
  vazio,
  vistaDe,
  type Campo,
  type Fase,
  type Ligacao,
  type Op,
  type Quadro,
  type VistaCard,
} from "./meta";
import type { CodigoCore } from "./types";

export type ResultadoRegra =
  | { ok: true; avisos?: string[] }
  | { ok: false; motivo: string; ruleId: string | null; codigo: CodigoCore; campos?: string[] };

const OK: ResultadoRegra = { ok: true };
const falha = (motivo: string, extra: { ruleId?: string | null; codigo?: CodigoCore; campos?: string[] } = {}) =>
  ({ ok: false, motivo, ruleId: extra.ruleId ?? null, codigo: extra.codigo ?? "regra", campos: extra.campos }) as const;

// ---------------------------------------------------------------------------
// Compilação com cache (expressões vêm da configuração e se repetem muito)
// ---------------------------------------------------------------------------

const cache = new Map<string, ExprCompilada>();
const LIMITE_CACHE = 1000;

export function compilar(fonte: string): ExprCompilada {
  let c = cache.get(fonte);
  if (!c) {
    c = compile(fonte);
    if (cache.size >= LIMITE_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(fonte, c);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

export interface AlvoContexto {
  quadro: Quadro;
  /** Estado do card a avaliar; id null = rascunho (createCard). */
  card: VistaCard;
  /** Ligações do card. Omitido: lidas do banco (card existente). Rascunho usa fromCardId = RASCUNHO. */
  ligacoes?: Ligacao[];
  /** Fase considerada "atual" (id). Padrão: card.phaseId. */
  fase?: string | null;
  faseOrigem?: string | null;
  faseDestino?: string | null;
}

interface Papel {
  outro: string;
  tipo: "pai" | "filho";
  nomes: string[];
  ehPaiDireto: boolean;
}

/**
 * Papel do outro card numa ligação, visto do card `eu`:
 * - relação is_parent: origem → destino é filho → pai. pai/pais(slug) de um lado; filhos(inverse_name|slug) do outro.
 * - relação comum: o card de origem vê os destinos como filhos(slug); o destino vê a origem como pais(inverse_name|slug).
 */
function papel(l: Ligacao, eu: string): Papel | null {
  if (l.fromCardId === l.toCardId) return null;
  const cfg = configRelacao(l.campo);
  const origem = l.fromCardId === eu;
  const outro = origem ? l.toCardId : l.fromCardId;
  const inversos = cfg.inverse_name ? [cfg.inverse_name, l.campo.slug] : [l.campo.slug];
  if (cfg.is_parent) {
    return origem
      ? { outro, tipo: "pai", nomes: [l.campo.slug], ehPaiDireto: true }
      : { outro, tipo: "filho", nomes: inversos, ehPaiDireto: false };
  }
  return origem
    ? { outro, tipo: "filho", nomes: [l.campo.slug], ehPaiDireto: false }
    : { outro, tipo: "pai", nomes: inversos, ehPaiDireto: false };
}

/** Monta o ExprContext com resolver pré-carregado só com o que as expressões referenciam. */
export async function montarContexto(op: Op, alvo: AlvoContexto, exprs: ExprCompilada[]): Promise<ExprContext> {
  const { quadro, card } = alvo;
  const eu = card.id ?? RASCUNHO;
  const ligacoes = alvo.ligacoes ?? (card.id ? await lerLigacoes(op, [card.id]) : []);

  const nomesFilhos = new Set<string>();
  const nomesPais = new Set<string>();
  const boards = new Set<string>();
  let dinamico = false;
  for (const e of exprs) {
    e.referencias.filhos.forEach((n) => nomesFilhos.add(n));
    e.referencias.pais.forEach((n) => nomesPais.add(n));
    e.referencias.boards.forEach((n) => boards.add(n));
    if (e.avisos.some((a) => a.tipo === "referencia_dinamica")) dinamico = true;
  }

  const papeis = ligacoes.filter((l) => l.fromCardId === eu || l.toCardId === eu).map((l) => papel(l, eu)).filter((p) => p !== null);
  const paiId = papeis.find((p) => p.ehPaiDireto)?.outro ?? null;
  const usados = papeis.filter(
    (p) => dinamico || p.nomes.some((n) => (p.tipo === "filho" ? nomesFilhos : nomesPais).has(n)),
  );
  const ids = [...new Set([...(paiId ? [paiId] : []), ...usados.map((p) => p.outro)])];
  const registros = await registrosDe(op, ids);

  const listas = { filho: new Map<string, Registro[]>(), pai: new Map<string, Registro[]>() };
  for (const p of usados) {
    const r = registros.get(p.outro);
    if (!r) continue;
    for (const n of new Set(p.nomes)) {
      const m = listas[p.tipo];
      m.set(n, [...(m.get(n) ?? []), r]);
    }
  }

  const porBoard = new Map<string, Registro[]>();
  for (const b of boards) porBoard.set(b, await cartoesDoBoard(op, quadro.workspaceId, b));

  const nomeFase = (id: string | null | undefined) => (id ? quadro.fasePorId.get(id)?.name ?? null : null);
  return {
    card: registro(quadro, card, ligacoes),
    pai: paiId ? registros.get(paiId) ?? null : null,
    fase: nomeFase(alvo.fase === undefined ? card.phaseId : alvo.fase),
    fase_origem: nomeFase(alvo.faseOrigem),
    fase_destino: nomeFase(alvo.faseDestino),
    usuario: await usuarioDe(op),
    hoje: dataNoFuso(quadro.timezone),
    resolver: {
      filhos: (rel) => listas.filho.get(rel) ?? [],
      pais: (rel) => listas.pai.get(rel) ?? [],
      cartoes: (b) => porBoard.get(b) ?? [],
    },
  };
}

/** Registros (por slug) de cards relacionados, cada um com o schema do próprio board. */
export async function registrosDe(op: Op, ids: string[]): Promise<Map<string, Registro>> {
  const saida = new Map<string, Registro>();
  for (const c of await lerCards(op, ids)) {
    saida.set(c.id, registro(await carregarQuadro(op, c.boardId), vistaDe(c)));
  }
  return saida;
}

async function cartoesDoBoard(op: Op, workspaceId: string, chave: string): Promise<Registro[]> {
  const boardId = await acharBoardId(op, workspaceId, chave);
  if (!boardId) return [];
  const q = await carregarQuadro(op, boardId);
  const rows = await op.tx.select().from(cards).where(and(eq(cards.boardId, boardId), isNull(cards.deletedAt)));
  return rows.map((c) => registro(q, vistaDe(c)));
}

async function usuarioDe(op: Op): Promise<Registro | null> {
  const { actor } = op;
  if (!actor.id) return null;
  if (actor.type === "user") {
    const [u] = await op.tx.select({ id: users.id, email: users.email, nome: users.name }).from(users).where(eq(users.id, actor.id));
    if (u) return { ...u, tipo: actor.type };
  }
  return { id: actor.id, tipo: actor.type };
}

// ---------------------------------------------------------------------------
// Avaliação
// ---------------------------------------------------------------------------

type Kind = "can_create" | "can_edit" | "can_enter" | "can_leave" | "can_back" | "can_delete";
type RegraRow = typeof rules.$inferSelect;

async function lerRegras(op: Op, boardId: string, kind: Kind, phaseId: string | null, fieldId?: string): Promise<RegraRow[]> {
  const fase = phaseId ? or(isNull(rules.phaseId), eq(rules.phaseId, phaseId)) : isNull(rules.phaseId);
  const campo = fieldId ? or(isNull(rules.fieldId), eq(rules.fieldId, fieldId)) : undefined;
  return op.tx
    .select()
    .from(rules)
    .where(and(eq(rules.boardId, boardId), eq(rules.kind, kind), eq(rules.enabled, true), fase, campo))
    .orderBy(asc(rules.position), asc(rules.id));
}

/** Avalia regras em ordem; a primeira falsa (ou com erro) bloqueia. */
async function avaliarRegras(op: Op, regras: RegraRow[], alvo: AlvoContexto, kind: Kind): Promise<ResultadoRegra> {
  if (!regras.length) return OK;
  const compiladas: { regra: RegraRow; expr: ExprCompilada }[] = [];
  for (const regra of regras) {
    try {
      compiladas.push({ regra, expr: compilar(regra.expr) });
    } catch (e) {
      return falha(`regra ${kind} inválida: ${(e as Error).message}`, { ruleId: regra.id });
    }
  }
  const ctx = await montarContexto(op, alvo, compiladas.map((c) => c.expr));
  for (const { regra, expr } of compiladas) {
    let passou: boolean;
    try {
      passou = expr.evaluateBool(ctx);
    } catch (e) {
      return falha(`erro ao avaliar regra ${kind}: ${(e as Error).message}`, { ruleId: regra.id });
    }
    if (!passou) return falha(regra.message ?? `bloqueado pela regra ${kind}`, { ruleId: regra.id });
  }
  return OK;
}

/**
 * Obrigatórios de todas as fases informadas. Por fase: field_phase_settings.required se definido;
 * senão required_expr avaliada com `fase` = aquela fase. Campo invisível na fase não é exigido nela.
 */
/** fases: null representa o board sem fases (expressões avaliadas com fase = null, sem ajuste por fase). */
export async function verificarObrigatorios(op: Op, alvo: AlvoContexto, fases: (Fase | null)[]): Promise<ResultadoRegra> {
  const { quadro, card } = alvo;
  const campos = quadro.campos.filter((c) => !TIPOS_SOMENTE_LEITURA.has(c.type));
  const exprs: ExprCompilada[] = [];
  const compiladas = new Map<string, ExprCompilada>();
  for (const c of campos) {
    for (const fonte of [c.requiredExpr, c.visibleExpr]) {
      if (!fonte || compiladas.has(fonte)) continue;
      try {
        const e = compilar(fonte);
        compiladas.set(fonte, e);
        exprs.push(e);
      } catch (e) {
        return falha(`expressão inválida no campo '${c.name}': ${(e as Error).message}`, { campos: [c.id] });
      }
    }
  }
  const ligacoes = alvo.ligacoes ?? (card.id ? await lerLigacoes(op, [card.id]) : []);
  const ctx = await montarContexto(op, { ...alvo, ligacoes }, exprs);
  const eu = card.id ?? RASCUNHO;

  const faltando: Campo[] = [];
  for (const c of campos) {
    const valor = c.type === "relation" ? ligacoes.filter((l) => l.campo.id === c.id && l.fromCardId === eu) : card.props[c.id];
    if (!vazio(valor)) continue;
    for (const f of fases) {
      const aj = f ? ajuste(quadro, c.id, f.id) : undefined;
      const ctxFase = { ...ctx, fase: f?.name ?? null };
      try {
        if (aj?.visible === false) continue;
        if (aj?.visible == null && c.visibleExpr && !compiladas.get(c.visibleExpr)!.evaluateBool(ctxFase)) continue;
        const exigido = aj?.required ?? (c.requiredExpr ? compiladas.get(c.requiredExpr)!.evaluateBool(ctxFase) : false);
        if (exigido) {
          faltando.push(c);
          break;
        }
      } catch (e) {
        return falha(`erro ao avaliar obrigatoriedade de '${c.name}': ${(e as Error).message}`, { campos: [c.id] });
      }
    }
  }
  if (!faltando.length) return OK;
  return falha(`campos obrigatórios não preenchidos: ${faltando.map((c) => c.name).join(", ")}`, {
    codigo: "obrigatorio",
    campos: faltando.map((c) => c.id),
  });
}

const fasesAte = (q: Quadro, fase: Fase, inclusive: boolean) =>
  q.fases.filter((f) => (inclusive ? f.position <= fase.position : f.position < fase.position));

/**
 * can_create: regras can_create; obrigatórios da fase inicial e de todas as anteriores (board sem
 * fases: obrigatórios gerais); e can_enter da fase inicial. Vale para qualquer canal (UI, API, seed).
 */
export async function canCreate(op: Op, alvo: AlvoContexto & { faseId: string | null }): Promise<ResultadoRegra> {
  const { quadro, faseId } = alvo;
  const a = { ...alvo, fase: faseId, faseDestino: faseId };
  const r = await avaliarRegras(op, await lerRegras(op, quadro.id, "can_create", faseId), a, "can_create");
  if (!r.ok) return r;
  const fase = faseId ? quadro.fasePorId.get(faseId)! : null;
  const obrig = await verificarObrigatorios(op, a, fase ? fasesAte(quadro, fase, true) : [null]);
  if (!obrig.ok) return obrig;
  if (!faseId) return OK;
  return canEnter(op, { ...alvo, origem: null, destino: faseId });
}

/** can_edit(campo): tipo somente leitura, editable=false na fase, trava por ligação e regras can_edit. */
export async function canEdit(op: Op, alvo: AlvoContexto & { campo: Campo }): Promise<ResultadoRegra> {
  const { quadro, card, campo } = alvo;
  if (TIPOS_SOMENTE_LEITURA.has(campo.type)) {
    return falha(`campo '${campo.name}' (${campo.type}) é somente leitura`, { codigo: "somente_leitura", campos: [campo.id] });
  }
  if (ajuste(quadro, campo.id, card.phaseId)?.editable === false) {
    return falha(`campo '${campo.name}' não é editável nesta fase`, { codigo: "somente_leitura", campos: [campo.id] });
  }
  const ligacoes = alvo.ligacoes ?? (card.id ? await lerLigacoes(op, [card.id]) : []);
  const trava = ligacoes.find((l) => travaCampo(l, campo, card.id ?? RASCUNHO));
  if (trava) {
    return falha(`campo '${campo.name}' travado enquanto houver ligação em '${trava.campo.name}'`, {
      codigo: "campo_travado",
      campos: [campo.id],
    });
  }
  const regras = await lerRegras(op, quadro.id, "can_edit", card.phaseId, campo.id);
  return avaliarRegras(op, regras, { ...alvo, ligacoes }, "can_edit");
}

/**
 * lock_fields_while_linked: campos listados ficam somente leitura enquanto a ligação existir.
 * Campo do board de origem da relação trava o card de origem; campo do board alvo trava o card de destino.
 */
export function travaCampo(l: Ligacao, campo: Campo, eu: string): boolean {
  const cfg = configRelacao(l.campo);
  if (!cfg.lock_fields_while_linked?.includes(campo.id)) return false;
  if (campo.boardId === l.campo.boardId && l.fromCardId === eu) return true;
  return campo.boardId === cfg.target_board && l.toCardId === eu;
}

export async function canEnter(
  op: Op,
  alvo: AlvoContexto & { origem: string | null; destino: string },
): Promise<ResultadoRegra> {
  const a = { ...alvo, faseOrigem: alvo.origem, faseDestino: alvo.destino };
  return avaliarRegras(op, await lerRegras(op, alvo.quadro.id, "can_enter", alvo.destino), a, "can_enter");
}

/** can_leave: obrigatórios da fase de origem e de TODAS as anteriores + regras can_leave. */
export async function canLeave(
  op: Op,
  alvo: AlvoContexto & { origem: string; destino: string | null },
): Promise<ResultadoRegra> {
  const { quadro } = alvo;
  const a = { ...alvo, faseOrigem: alvo.origem, faseDestino: alvo.destino };
  const origem = quadro.fasePorId.get(alvo.origem);
  if (origem) {
    const obrig = await verificarObrigatorios(op, a, fasesAte(quadro, origem, true));
    if (!obrig.ok) return obrig;
  }
  return avaliarRegras(op, await lerRegras(op, quadro.id, "can_leave", alvo.origem), a, "can_leave");
}

/**
 * can_back: regras can_back da fase de origem. Se falhar, on_fail.children decide:
 * 'block' (padrão) bloqueia; 'keep' permite e mantém os filhos. 'cancel'/'delete' ficam para v1.
 */
export async function canBack(
  op: Op,
  alvo: AlvoContexto & { origem: string; destino: string },
): Promise<ResultadoRegra> {
  const a = { ...alvo, faseOrigem: alvo.origem, faseDestino: alvo.destino };
  const regras = await lerRegras(op, alvo.quadro.id, "can_back", alvo.origem);
  const avisos: string[] = [];
  for (const regra of regras) {
    const r = await avaliarRegras(op, [regra], a, "can_back");
    if (r.ok) continue;
    const acao = (regra.onFail as { children?: string } | null)?.children ?? "block";
    if (acao === "keep") {
      avisos.push(r.motivo);
      continue;
    }
    if (acao !== "block") return { ...r, motivo: `${r.motivo} (on_fail '${acao}' ainda não suportado; MVP: block/keep)` };
    return r;
  }
  return avisos.length ? { ok: true, avisos } : OK;
}

export async function canDelete(op: Op, alvo: AlvoContexto): Promise<ResultadoRegra> {
  return avaliarRegras(op, await lerRegras(op, alvo.quadro.id, "can_delete", alvo.card.phaseId), alvo, "can_delete");
}
