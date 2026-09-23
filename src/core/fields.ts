// Campos: validação por tipo, valores padrão, unicidade, sequence e campos calculados.
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { cards, sequences, workspaceMembers } from "../db/schema";
import type { ExprCompilada, ExprContext, Registro } from "../lib/expr";
import { emitirEvento } from "./events";
import {
  acharCampo,
  carregarQuadro,
  configRelacao,
  dataNoFuso,
  lerLigacoes,
  RASCUNHO,
  registro,
  TIPOS_SOMENTE_LEITURA,
  tituloDe,
  vazio,
  vistaDe,
  type Campo,
  type Ligacao,
  type Op,
  type Quadro,
  type VistaCard,
} from "./meta";
import { compilar, montarContexto, registrosDe } from "./rules";
import { CoreError, ehUuid, type CardRow, type Tx } from "./types";

// ---------------------------------------------------------------------------
// Validação por tipo
// ---------------------------------------------------------------------------

const invalido = (c: Campo, motivo: string) => new CoreError("validacao", `campo '${c.name}': ${motivo}`, { campos: [c.id] });

type Opcao = string | { value?: string; id?: string; label?: string };
const chaveOpcao = (o: Opcao) => (typeof o === "string" ? o : (o.value ?? o.id ?? o.label ?? ""));

function opcoes(c: Campo): string[] {
  const o = c.config.options;
  return Array.isArray(o) ? (o as Opcao[]).map(chaveOpcao) : [];
}

function numero(c: Campo, v: unknown): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) throw invalido(c, "número inválido");
  return n;
}

function dataValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

function limites(c: Campo, medida: number | string, rotulo: string) {
  const v = c.validation ?? {};
  const min = v.min as number | string | undefined;
  const max = v.max as number | string | undefined;
  if (min !== undefined && medida < min) throw invalido(c, `${rotulo} abaixo do mínimo (${min})`);
  if (max !== undefined && medida > max) throw invalido(c, `${rotulo} acima do máximo (${max})`);
}

export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(cpf[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

/** CNPJ numérico ou alfanumérico (IN RFB 2.229/2024): 12 posições [0-9A-Z] + 2 DVs numéricos. */
export function cnpjValido(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const valor = (ch: string) => ch.charCodeAt(0) - 48;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += valor(cnpj[i]) * (((n - 1 - i) % 8) + 2);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(cnpj[12]) && dv(13) === Number(cnpj[13]);
}

/** Valida e normaliza um valor de entrada. null/""/[] limpam o campo (retornam null). */
export async function validarValor(op: Op, q: Quadro, c: Campo, v: unknown): Promise<unknown> {
  if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) return null;
  switch (c.type) {
    case "text":
    case "long_text": {
      if (typeof v !== "string") throw invalido(c, "texto esperado");
      limites(c, v.length, "tamanho");
      const re = c.validation?.regex;
      if (typeof re === "string" && !new RegExp(re).test(v)) throw invalido(c, "formato inválido");
      return v;
    }
    case "number": {
      const n = numero(c, v);
      limites(c, n, "valor");
      return n;
    }
    case "currency": {
      const n = Math.round(numero(c, v) * 100) / 100;
      limites(c, n, "valor");
      return n;
    }
    case "date": {
      if (typeof v !== "string" || !dataValida(v)) throw invalido(c, "data AAAA-MM-DD esperada");
      limites(c, v, "data");
      return v;
    }
    case "datetime": {
      const d = typeof v === "string" || v instanceof Date ? new Date(v) : null;
      if (!d || Number.isNaN(d.getTime())) throw invalido(c, "data/hora ISO esperada");
      return d.toISOString();
    }
    case "boolean":
      if (typeof v !== "boolean") throw invalido(c, "booleano esperado");
      return v;
    case "select":
      if (typeof v !== "string" || !opcoes(c).includes(v)) throw invalido(c, `opção inválida: ${String(v)}`);
      return v;
    case "multi_select": {
      const lista = Array.isArray(v) ? v : [v];
      const validas = opcoes(c);
      for (const x of lista) if (typeof x !== "string" || !validas.includes(x)) throw invalido(c, `opção inválida: ${String(x)}`);
      return [...new Set(lista as string[])];
    }
    case "person": {
      const multiplo = c.config.multiple === true;
      const lista = Array.isArray(v) ? v : [v];
      if (!multiplo && lista.length > 1) throw invalido(c, "apenas uma pessoa");
      for (const id of lista) {
        if (!ehUuid(id)) throw invalido(c, "id de usuário inválido");
        const [m] = await op.tx
          .select({ u: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, q.workspaceId), eq(workspaceMembers.userId, id)));
        if (!m) throw invalido(c, `usuário ${id} não é membro do workspace`);
      }
      return multiplo ? [...new Set(lista as string[])] : lista[0];
    }
    case "cpf": {
      const d = typeof v === "string" ? v.replace(/[.\-\s]/g, "") : "";
      if (!cpfValido(d)) throw invalido(c, "CPF inválido");
      return d;
    }
    case "cnpj": {
      const d = typeof v === "string" ? v.replace(/[./\-\s]/g, "").toUpperCase() : "";
      if (!cnpjValido(d)) throw invalido(c, "CNPJ inválido");
      return d;
    }
    case "relation": {
      const lista = Array.isArray(v) ? v : [v];
      for (const id of lista) if (!ehUuid(id)) throw invalido(c, "id de card inválido");
      if (configRelacao(c).cardinality === "one" && lista.length > 1) throw invalido(c, "relação aceita um card");
      return [...new Set(lista as string[])];
    }
    case "attachment": {
      const lista = Array.isArray(v) ? v : [v];
      for (const id of lista) if (!ehUuid(id)) throw invalido(c, "id de anexo inválido");
      return lista;
    }
    default:
      if (typeof v === "function" || typeof v === "symbol" || typeof v === "bigint") throw invalido(c, "valor inválido");
      return v;
  }
}

export interface EntradaNormalizada {
  /** field_id → valor normalizado (null = limpar). Sem relações. */
  props: Map<string, unknown>;
  /** field_id do campo de relação → ids de destino desejados. */
  relacoes: Map<string, string[]>;
}

/** Entrada por id ou slug → valores validados. Recusa campos desconhecidos e somente leitura. */
export async function normalizarEntrada(op: Op, q: Quadro, entrada: Record<string, unknown>): Promise<EntradaNormalizada> {
  const saida: EntradaNormalizada = { props: new Map(), relacoes: new Map() };
  for (const [chave, bruto] of Object.entries(entrada ?? {})) {
    const c = acharCampo(q, chave);
    if (!c) throw new CoreError("validacao", `campo desconhecido: ${chave}`);
    if (TIPOS_SOMENTE_LEITURA.has(c.type)) {
      throw new CoreError("somente_leitura", `campo '${c.name}' (${c.type}) é somente leitura`, { campos: [c.id] });
    }
    const v = await validarValor(op, q, c, bruto);
    if (c.type === "relation") saida.relacoes.set(c.id, (v as string[] | null) ?? []);
    else saida.props.set(c.id, v);
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Valor padrão (default_value_expr), avaliado só na criação
// ---------------------------------------------------------------------------

export async function aplicarPadroes(
  op: Op,
  q: Quadro,
  rascunho: VistaCard,
  ligacoes: Ligacao[],
  informados: Set<string>,
): Promise<void> {
  const alvos = q.campos.filter(
    (c) => c.defaultValueExpr && !informados.has(c.id) && c.type !== "relation" && !TIPOS_SOMENTE_LEITURA.has(c.type),
  );
  if (!alvos.length) return;
  const exprs = new Map<string, ExprCompilada>();
  for (const c of alvos) {
    try {
      exprs.set(c.id, compilar(c.defaultValueExpr!));
    } catch (e) {
      throw invalido(c, `default_value_expr inválida: ${(e as Error).message}`);
    }
  }
  const ctx = await montarContexto(op, { quadro: q, card: rascunho, ligacoes }, [...exprs.values()]);
  for (const c of alvos) {
    let v: unknown;
    try {
      v = exprs.get(c.id)!.evaluate(ctx);
    } catch (e) {
      throw invalido(c, `erro no valor padrão: ${(e as Error).message}`);
    }
    const norm = await validarValor(op, q, c, v);
    if (norm !== null) rascunho.props[c.id] = norm;
  }
}

// ---------------------------------------------------------------------------
// Unicidade (unique_value): lock consultivo por (campo, valor) serializa inserções concorrentes
// ---------------------------------------------------------------------------

export async function verificarUnicidade(op: Op, q: Quadro, cardId: string | null, props: Map<string, unknown>): Promise<void> {
  for (const [fieldId, v] of props) {
    const c = q.campoPorId.get(fieldId);
    if (!c?.uniqueValue || vazio(v)) continue;
    const alvo = JSON.stringify({ [fieldId]: v });
    await op.tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${alvo}, 0))`);
    const [dup] = await op.tx
      .select({ id: cards.id })
      .from(cards)
      .where(
        and(
          eq(cards.boardId, q.id),
          isNull(cards.deletedAt),
          sql`${cards.props} @> ${alvo}::jsonb`,
          cardId ? ne(cards.id, cardId) : undefined,
        ),
      )
      .limit(1);
    if (dup) {
      throw new CoreError("unicidade", `campo '${c.name}': valor já usado no card ${dup.id}`, { campos: [c.id] });
    }
  }
}

// ---------------------------------------------------------------------------
// Sequence: atribuída no INSERT, com SELECT ... FOR UPDATE na linha de sequences
// ---------------------------------------------------------------------------

interface ConfigSequencia {
  pattern?: string;
  scope?: "global" | "year" | "month" | "day" | "parent";
  parent_field?: string;
  seed?: number;
  pad?: number;
}

/** Atribui valores de sequence no rascunho. Campos em ordem de id (ordem de lock estável). */
export async function atribuirSequencias(op: Op, q: Quadro, rascunho: VistaCard, ligacoes: Ligacao[]): Promise<void> {
  const campos = q.campos.filter((c) => c.type === "sequence").sort((a, b) => a.id.localeCompare(b.id));
  if (!campos.length) return;
  const hoje = dataNoFuso(q.timezone);
  const [ano, mes, dia] = hoje.split("-");

  for (const c of campos) {
    const cfg = (c.config.sequence ?? {}) as ConfigSequencia;
    const escopo = cfg.scope ?? "global";
    const paiId = paiDoRascunho(q, c, cfg, ligacoes);
    let chave: string;
    switch (escopo) {
      case "global":
        chave = "";
        break;
      case "year":
        chave = ano;
        break;
      case "month":
        chave = `${ano}-${mes}`;
        break;
      case "day":
        chave = hoje;
        break;
      case "parent":
        if (!paiId) throw new CoreError("sequencia", `campo '${c.name}': sequence por pai exige o card pai na criação`, { campos: [c.id] });
        chave = paiId;
        break;
      default:
        throw new CoreError("sequencia", `campo '${c.name}': escopo de sequence inválido: ${String(escopo)}`, { campos: [c.id] });
    }
    const n = await proximoValor(op.tx, c.id, chave, cfg.seed ?? 1);
    const pai = paiId && /\{pai\./.test(cfg.pattern ?? "") ? (await registrosDe(op, [paiId])).get(paiId) : undefined;
    rascunho.props[c.id] = formatarSequencia(cfg.pattern ?? "{n}", n, cfg.pad ?? 4, { ano, mes, dia }, pai);
  }
}

function paiDoRascunho(q: Quadro, c: Campo, cfg: ConfigSequencia, ligacoes: Ligacao[]): string | null {
  const minhas = ligacoes.filter((l) => l.fromCardId === RASCUNHO);
  if (cfg.parent_field) {
    const rel = acharCampo(q, cfg.parent_field);
    if (!rel || rel.type !== "relation") {
      throw new CoreError("sequencia", `campo '${c.name}': parent_field não é relação deste board`, { campos: [c.id] });
    }
    return minhas.find((l) => l.campo.id === rel.id)?.toCardId ?? null;
  }
  return minhas.find((l) => configRelacao(l.campo).is_parent)?.toCardId ?? null;
}

/** Próximo valor do contador (field, escopo). Semente = primeiro valor emitido. Nunca reutilizado. */
export async function proximoValor(tx: Tx, fieldId: string, chave: string, semente: number): Promise<number> {
  await tx
    .insert(sequences)
    .values({ fieldId, scopeKey: chave, lastValue: semente - 1 })
    .onConflictDoNothing();
  const [linha] = await tx
    .select({ v: sequences.lastValue })
    .from(sequences)
    .where(and(eq(sequences.fieldId, fieldId), eq(sequences.scopeKey, chave)))
    .for("update");
  const n = Number(linha.v) + 1;
  await tx
    .update(sequences)
    .set({ lastValue: n })
    .where(and(eq(sequences.fieldId, fieldId), eq(sequences.scopeKey, chave)));
  return n;
}

/** Tokens: {n} {n:4} {ano} {mes} {dia} {pai.<slug>}. Token desconhecido fica literal. */
export function formatarSequencia(
  padrao: string,
  n: number,
  pad: number,
  data: { ano: string; mes: string; dia: string },
  pai?: Registro,
): string {
  return padrao.replace(/\{([^{}]+)\}/g, (inteiro, tok: string) => {
    const m = /^n(?::(\d+))?$/.exec(tok);
    if (m) return String(n).padStart(m[1] ? Number(m[1]) : pad, "0");
    if (tok === "ano") return data.ano;
    if (tok === "mes") return data.mes;
    if (tok === "dia") return data.dia;
    if (tok.startsWith("pai.")) {
      const v = pai?.[tok.slice(4)];
      return vazio(v) ? "" : String(v);
    }
    return inteiro;
  });
}

// ---------------------------------------------------------------------------
// Relação exclusiva: índice único parcial (field_id, to_card_id)
// ---------------------------------------------------------------------------

const indicesGarantidos = new Set<string>();

export const nomeIndiceExclusivo = (fieldId: string) => `card_links_excl_${fieldId.replace(/-/g, "")}`;

/**
 * Garante o índice único parcial de uma relação exclusiva. Idempotente e seguro sob concorrência
 * (lock consultivo). Deve ser chamado ao configurar o campo; linkCards também chama por garantia.
 */
export async function garantirIndiceExclusivo(tx: Tx, fieldId: string): Promise<void> {
  if (!ehUuid(fieldId)) throw new CoreError("validacao", "field_id inválido");
  const nome = nomeIndiceExclusivo(fieldId);
  if (indicesGarantidos.has(nome)) return;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${nome}, 0))`);
  const existe = await tx.execute(sql`select 1 from pg_indexes where indexname = ${nome}`);
  if (!existe.length) {
    await tx.execute(
      sql.raw(`create unique index if not exists ${nome} on card_links (to_card_id) where field_id = '${fieldId}' and deleted_at is null`),
    );
  }
  indicesGarantidos.add(nome);
}

// ---------------------------------------------------------------------------
// Campos calculados (computed): rollup e dynamic_text
// ---------------------------------------------------------------------------

interface ConfigRollup {
  via_field?: string;
  agg?: "count" | "sum" | "avg" | "min" | "max";
  expr?: string;
  filter_expr?: string;
}

const SLUG = /^[A-Za-z_][A-Za-z0-9_]*$/;

function exprItem(fonte: string, variavel: string): ExprCompilada {
  return compilar(SLUG.test(fonte) ? `${variavel}.${fonte}` : fonte);
}

async function calcularRollup(op: Op, q: Quadro, card: CardRow, c: Campo, ligs: Ligacao[], eu: Registro): Promise<unknown> {
  const cfg = (c.config.rollup ?? {}) as ConfigRollup;
  const agg = cfg.agg ?? "count";
  const relacionados = ligs
    .filter((l) => l.campo.id === cfg.via_field)
    .flatMap((l) =>
      l.campo.boardId === q.id
        ? l.fromCardId === card.id ? [l.toCardId] : []
        : l.toCardId === card.id ? [l.fromCardId] : [],
    );
  const regs = [...(await registrosDe(op, [...new Set(relacionados)])).values()];
  const base: ExprContext = { card: {}, pai: eu, hoje: dataNoFuso(q.timezone) };

  const filtro = cfg.filter_expr ? compilar(cfg.filter_expr) : null;
  const itens = filtro ? regs.filter((r) => filtro.evaluateBool({ ...base, card: r })) : regs;
  if (agg === "count") return itens.length;

  const valor = cfg.expr ? exprItem(cfg.expr, "card") : null;
  if (!valor) throw new CoreError("validacao", `rollup '${c.name}': expr obrigatória para ${agg}`, { campos: [c.id] });
  const nums = itens
    .map((r) => valor.evaluate({ ...base, card: r }))
    .map((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v))
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  switch (agg) {
    case "sum":
      return nums.reduce((a, b) => a + b, 0);
    case "avg":
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    case "min":
      return nums.length ? Math.min(...nums) : null;
    case "max":
      return nums.length ? Math.max(...nums) : null;
    default:
      throw new CoreError("validacao", `rollup '${c.name}': agregação inválida ${String(agg)}`, { campos: [c.id] });
  }
}

function segmentosTexto(c: Campo): { literal: string[]; exprs: ExprCompilada[] } {
  const modelo = String((c.config.dynamic_text as { template?: string } | undefined)?.template ?? "");
  const literal: string[] = [];
  const exprs: ExprCompilada[] = [];
  let ultimo = 0;
  for (const m of modelo.matchAll(/\{([^{}]+)\}/g)) {
    literal.push(modelo.slice(ultimo, m.index));
    exprs.push(exprItem(m[1].trim(), "card"));
    ultimo = m.index! + m[0].length;
  }
  literal.push(modelo.slice(ultimo));
  return { literal, exprs };
}

function formatar(v: unknown): string {
  if (vazio(v)) return "";
  if (Array.isArray(v)) return v.map(formatar).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

async function calcularTexto(op: Op, q: Quadro, vista: VistaCard, c: Campo, ligs: Ligacao[]): Promise<string> {
  let seg: ReturnType<typeof segmentosTexto>;
  try {
    seg = segmentosTexto(c);
  } catch {
    return "#ERRO";
  }
  const ctx = await montarContexto(op, { quadro: q, card: vista, ligacoes: ligs }, seg.exprs);
  let saida = seg.literal[0];
  seg.exprs.forEach((e, i) => {
    let parte: string;
    try {
      parte = formatar(e.evaluate(ctx));
    } catch {
      parte = "#ERRO";
    }
    saida += parte + seg.literal[i + 1];
  });
  return saida;
}

/** Recalcula rollups e dynamic_text de um card (rollups primeiro; textos podem usá-los). */
async function calcular(op: Op, q: Quadro, card: CardRow, ligs: Ligacao[]): Promise<Record<string, unknown>> {
  const computed: Record<string, unknown> = { ...card.computed };
  const vista = { ...vistaDe(card), computed };
  const eu = registro(q, vista, ligs);
  for (const c of q.campos.filter((x) => x.type === "rollup")) {
    try {
      computed[c.id] = await calcularRollup(op, q, card, c, ligs, eu);
    } catch {
      computed[c.id] = null; // configuração inválida não bloqueia escrita; valor fica nulo
    }
  }
  for (const c of q.campos.filter((x) => x.type === "dynamic_text")) {
    computed[c.id] = await calcularTexto(op, q, vista, c, ligs);
  }
  return computed;
}

/** Board depende dos relacionados? (rollup pela relação, ou dynamic_text que lê pai/pais/filhos) */
function dependeDe(q: Quadro, l: Ligacao, outroEhOrigem: boolean): boolean {
  const rollup = q.campos.some((c) => {
    if (c.type !== "rollup") return false;
    const via = (c.config.rollup as ConfigRollup | undefined)?.via_field;
    if (via !== l.campo.id) return false;
    return outroEhOrigem ? l.campo.boardId === q.id : l.campo.boardId !== q.id;
  });
  if (rollup) return true;
  return q.campos.some((c) => {
    if (c.type !== "dynamic_text") return false;
    try {
      return segmentosTexto(c).exprs.some(
        (e) => e.referencias.pai.length || e.referencias.pais.length || e.referencias.filhos.length,
      );
    } catch {
      return false;
    }
  });
}

/**
 * Recalcula computed dos cards informados e propaga para quem depende deles (pais com rollup,
 * filhos com texto que lê o pai), em cascata. Emite card.field_updated (computed=true) por mudança,
 * exceto nos cards de `semEventos` (card recém-criado: card.created já registra o estado inicial).
 */
export async function recalcular(op: Op, cardIds: string[], opcoes: { semEventos?: string[] } = {}): Promise<void> {
  const fila = [...new Set(cardIds)].map((id) => ({ id, propagar: true }));
  const feitos = new Set<string>();
  let passos = 0;
  while (fila.length) {
    const { id, propagar } = fila.shift()!;
    if (feitos.has(id)) continue;
    feitos.add(id);
    if (++passos > 1000) throw new CoreError("validacao", "recálculo excedeu 1000 cards (ciclo de dependência?)");

    const [card] = await op.tx.select().from(cards).where(and(eq(cards.id, id), isNull(cards.deletedAt))).for("no key update");
    if (!card) continue;
    const q = await carregarQuadro(op, card.boardId);
    const ligs = await lerLigacoes(op, [id]);
    const novo = await calcular(op, q, card, ligs);

    const mudancas = q.campos
      .filter((c) => c.id in novo && JSON.stringify(novo[c.id]) !== JSON.stringify(card.computed[c.id]))
      .map((c) => ({ fieldId: c.id, old: card.computed[c.id], new: novo[c.id] }));
    if (mudancas.length) {
      await op.tx
        .update(cards)
        .set({ computed: novo, title: tituloDe(q, card.props, novo), updatedAt: new Date() })
        .where(eq(cards.id, id));
      for (const m of opcoes.semEventos?.includes(id) ? [] : mudancas) {
        await emitirEvento(
          op.tx,
          { workspaceId: card.workspaceId, boardId: card.boardId, cardId: id, actor: op.actor },
          { type: "card.field_updated", data: { field_id: m.fieldId, old: m.old, new: m.new, computed: true } },
        );
      }
    }
    if (!propagar && !mudancas.length) continue;
    for (const l of ligs) {
      const outroEhOrigem = l.toCardId === id;
      const outro = outroEhOrigem ? l.fromCardId : l.toCardId;
      if (outro === id || feitos.has(outro)) continue;
      const [oc] = await op.tx.select({ boardId: cards.boardId }).from(cards).where(eq(cards.id, outro));
      if (oc && dependeDe(await carregarQuadro(op, oc.boardId), l, outroEhOrigem)) fila.push({ id: outro, propagar: false });
    }
  }
}
