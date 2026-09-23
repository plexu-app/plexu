// Leitura de configuração e de cards para uso interno do core (nunca escreve).
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { boards, cardLinks, cards, fieldPhaseSettings, fields, phases, workspaces } from "../db/schema";
import type { Registro } from "../lib/expr";
import { CoreError, ehUuid, type Actor, type CardRow, type Tx } from "./types";

export type TipoCampo = string;

export interface ConfigRelacao {
  target_board?: string;
  cardinality?: "one" | "many";
  exclusive?: boolean;
  filter_expr?: string;
  inverse_name?: string;
  is_parent?: boolean;
  lock_fields_while_linked?: string[];
}

export interface Campo {
  id: string;
  boardId: string;
  type: TipoCampo;
  name: string;
  slug: string;
  requiredExpr: string | null;
  visibleExpr: string | null;
  uniqueValue: boolean;
  defaultValueExpr: string | null;
  validation: Record<string, unknown> | null;
  config: Record<string, unknown>;
  position: number;
}

export interface Fase {
  id: string;
  boardId: string;
  name: string;
  position: number;
  isTerminal: boolean;
  allowCreate: boolean;
}

export interface AjusteFase {
  visible: boolean | null;
  editable: boolean | null;
  required: boolean | null;
}

export interface Quadro {
  id: string;
  workspaceId: string;
  kind: "workflow" | "database";
  slug: string;
  titleFieldId: string | null;
  timezone: string;
  campos: Campo[];
  campoPorId: Map<string, Campo>;
  campoPorSlug: Map<string, Campo>;
  /** Fases ativas em ordem de posição. */
  fases: Fase[];
  fasePorId: Map<string, Fase>;
  ajustes: Map<string, AjusteFase>;
}

/** Estado de uma operação do core: transação, ator e caches de leitura. */
export interface Op {
  tx: Tx;
  actor: Actor;
  quadros: Map<string, Promise<Quadro>>;
}

export const TIPOS_CALCULADOS = new Set(["rollup", "dynamic_text", "formula", "lookup"]);
export const TIPOS_SOMENTE_LEITURA = new Set([...TIPOS_CALCULADOS, "sequence"]);

export const configRelacao = (c: Campo): ConfigRelacao => (c.config.relation ?? {}) as ConfigRelacao;

export function ajuste(q: Quadro, fieldId: string, phaseId: string | null): AjusteFase | undefined {
  return phaseId ? q.ajustes.get(`${fieldId}:${phaseId}`) : undefined;
}

export function carregarQuadro(op: Op, boardId: string): Promise<Quadro> {
  let p = op.quadros.get(boardId);
  if (!p) {
    p = lerQuadro(op.tx, boardId);
    op.quadros.set(boardId, p);
    p.catch(() => op.quadros.delete(boardId));
  }
  return p;
}

async function lerQuadro(tx: Tx, boardId: string): Promise<Quadro> {
  const [b] = await tx
    .select({ board: boards, wsSettings: workspaces.settings })
    .from(boards)
    .innerJoin(workspaces, eq(workspaces.id, boards.workspaceId))
    .where(and(eq(boards.id, boardId), isNull(boards.archivedAt)));
  if (!b) throw new CoreError("nao_encontrado", `board ${boardId} não encontrado`);

  const [fs, ps] = await Promise.all([
    tx.select().from(fields).where(and(eq(fields.boardId, boardId), isNull(fields.archivedAt))).orderBy(asc(fields.position)),
    tx.select().from(phases).where(and(eq(phases.boardId, boardId), isNull(phases.archivedAt))).orderBy(asc(phases.position)),
  ]);
  const ajs = fs.length
    ? await tx.select().from(fieldPhaseSettings).where(inArray(fieldPhaseSettings.fieldId, fs.map((f) => f.id)))
    : [];

  const campos: Campo[] = fs.map((f) => ({
    id: f.id,
    boardId: f.boardId,
    type: f.type,
    name: f.name,
    slug: f.slug,
    requiredExpr: f.requiredExpr,
    visibleExpr: f.visibleExpr,
    uniqueValue: f.uniqueValue,
    defaultValueExpr: f.defaultValueExpr,
    validation: (f.validation as Record<string, unknown> | null) ?? null,
    config: (f.config as Record<string, unknown>) ?? {},
    position: f.position,
  }));
  const fases: Fase[] = ps.map((p) => ({
    id: p.id,
    boardId: p.boardId,
    name: p.name,
    position: p.position,
    isTerminal: p.isTerminal,
    allowCreate: p.allowCreate,
  }));
  const settings = (b.wsSettings ?? {}) as { timezone?: string };
  return {
    id: b.board.id,
    workspaceId: b.board.workspaceId,
    kind: b.board.kind,
    slug: b.board.slug,
    titleFieldId: b.board.titleFieldId,
    timezone: settings.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    campos,
    campoPorId: new Map(campos.map((c) => [c.id, c])),
    campoPorSlug: new Map(campos.map((c) => [c.slug, c])),
    fases,
    fasePorId: new Map(fases.map((f) => [f.id, f])),
    ajustes: new Map(
      ajs.map((a) => [`${a.fieldId}:${a.phaseId}`, { visible: a.visible, editable: a.editable, required: a.required }]),
    ),
  };
}

/** Resolve um campo por id ou slug. */
export function acharCampo(q: Quadro, chave: string): Campo | undefined {
  return q.campoPorId.get(chave) ?? q.campoPorSlug.get(chave);
}

/** Resolve board por id ou slug dentro do workspace. */
export async function acharBoardId(op: Op, workspaceId: string, chave: string): Promise<string | null> {
  const cond = ehUuid(chave) ? or(eq(boards.id, chave), eq(boards.slug, chave)) : eq(boards.slug, chave);
  const [b] = await op.tx
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.workspaceId, workspaceId), cond, isNull(boards.archivedAt)));
  return b?.id ?? null;
}

/** Card não excluído; com lock=true, SELECT ... FOR NO KEY UPDATE (não bloqueia FKs que o referenciam). */
export async function lerCard(op: Op, cardId: string, lock = false): Promise<CardRow> {
  if (!ehUuid(cardId)) throw new CoreError("nao_encontrado", `card ${String(cardId)} não encontrado`);
  const q = op.tx.select().from(cards).where(and(eq(cards.id, cardId), isNull(cards.deletedAt)));
  const [c] = lock ? await q.for("no key update") : await q;
  if (!c) throw new CoreError("nao_encontrado", `card ${cardId} não encontrado`);
  return c;
}

export async function lerCards(op: Op, ids: string[]): Promise<CardRow[]> {
  if (!ids.length) return [];
  return op.tx.select().from(cards).where(and(inArray(cards.id, ids), isNull(cards.deletedAt)));
}

export function vazio(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

// ---------------------------------------------------------------------------
// Ligações
// ---------------------------------------------------------------------------

export interface Ligacao {
  linkId: string;
  campo: Campo;
  fromCardId: string;
  toCardId: string;
}

/** Ligações que tocam os cards (nos dois lados), com o campo de relação já resolvido. */
export async function lerLigacoes(op: Op, cardIds: string[]): Promise<Ligacao[]> {
  if (!cardIds.length) return [];
  const rows = await op.tx
    .select({ id: cardLinks.id, fieldId: cardLinks.fieldId, from: cardLinks.fromCardId, to: cardLinks.toCardId, boardId: fields.boardId })
    .from(cardLinks)
    .innerJoin(fields, eq(fields.id, cardLinks.fieldId))
    .where(or(inArray(cardLinks.fromCardId, cardIds), inArray(cardLinks.toCardId, cardIds)))
    .orderBy(asc(cardLinks.position), asc(cardLinks.createdAt));
  const saida: Ligacao[] = [];
  for (const r of rows) {
    const campo = (await carregarQuadro(op, r.boardId)).campoPorId.get(r.fieldId);
    if (campo) saida.push({ linkId: r.id, campo, fromCardId: r.from, toCardId: r.to });
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Registro: card visto pelas expressões (slug → valor)
// ---------------------------------------------------------------------------

/** Chaves de metadado adicionadas ao registro quando não colidem com slug de campo. */
const META = ["id", "titulo", "fase", "status"] as const;

/** Id usado nas ligações de um card ainda não inserido (rascunho de createCard). */
export const RASCUNHO = "";

export interface VistaCard {
  id: string | null;
  phaseId: string | null;
  title: string;
  status: string;
  props: Record<string, unknown>;
  computed: Record<string, unknown>;
}

export function vistaDe(c: CardRow): VistaCard {
  return { id: c.id, phaseId: c.phaseId, title: c.title, status: c.status, props: c.props, computed: c.computed };
}

/**
 * props/computed (chaveados por field_id) → registro por slug.
 * Campos de relação viram lista de ids ligados a partir deste card (lado origem).
 */
export function registro(q: Quadro, card: VistaCard, ligacoes: Ligacao[] = []): Registro {
  const r: Registro = {};
  for (const c of q.campos) {
    if (c.type === "relation") {
      const eu = card.id ?? RASCUNHO;
      r[c.slug] = ligacoes.filter((l) => l.campo.id === c.id && l.fromCardId === eu).map((l) => l.toCardId);
      continue;
    }
    const v = TIPOS_CALCULADOS.has(c.type) ? card.computed[c.id] : card.props[c.id];
    if (v !== undefined) r[c.slug] = v;
  }
  const meta: Record<(typeof META)[number], unknown> = {
    id: card.id,
    titulo: card.title,
    fase: card.phaseId ? q.fasePorId.get(card.phaseId)?.name ?? null : null,
    status: card.status,
  };
  for (const k of META) if (!q.campoPorSlug.has(k)) r[k] = meta[k];
  return r;
}

/** Valor do título a partir do campo de título do board. */
export function tituloDe(q: Quadro, props: Record<string, unknown>, computed: Record<string, unknown>): string {
  if (!q.titleFieldId) return "";
  const c = q.campoPorId.get(q.titleFieldId);
  const v = c && TIPOS_CALCULADOS.has(c.type) ? computed[q.titleFieldId] : props[q.titleFieldId];
  if (vazio(v)) return "";
  return Array.isArray(v) ? v.join(", ") : String(v);
}

/** Data AAAA-MM-DD no fuso do workspace. */
export function dataNoFuso(timezone: string, d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
