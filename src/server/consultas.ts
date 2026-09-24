import "server-only";
// Leituras para a UI. Componentes e route handlers não fazem SQL: chamam estas funções.
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  boards,
  cardComments,
  cardLinks,
  cards,
  events,
  fields,
  phases,
  users,
  workspaceMembers,
  workspaces,
} from "@/db/schema";

export type Papel = "owner" | "admin" | "member" | "guest";

export interface CampoUI {
  id: string;
  boardId: string;
  slug: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  position: number;
  requiredExpr: string | null;
  visibleExpr: string | null;
  defaultValueExpr: string | null;
  uniqueValue: boolean;
  validation: Record<string, unknown> | null;
  helpText: string | null;
}

export interface FaseUI {
  id: string;
  name: string;
  position: number;
  isTerminal: boolean;
  color: string | null;
}

/** Preferências de exibição guardadas em boards.settings. */
export interface SettingsBoard {
  /** Até 3 campos mostrados no cartão do kanban. */
  kanban_fields?: string[];
  /** Campo de data usado como prazo no cartão (além de cards.due_at). */
  kanban_due_field?: string | null;
}

export interface BoardCompleto {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  kind: "workflow" | "database";
  titleFieldId: string | null;
  settings: SettingsBoard;
  fases: FaseUI[];
  campos: CampoUI[];
}

export interface CardResumo {
  id: string;
  boardId: string;
  title: string;
  phaseId: string | null;
  status: string;
  props: Record<string, unknown>;
  computed: Record<string, unknown>;
  updatedAt: Date;
  assignees: string[];
  dueAt: Date | null;
}

// ---------------------------------------------------------------------------
// Usuários e workspaces
// ---------------------------------------------------------------------------

interface AuthJson {
  senha?: string;
  sv?: number;
}

export async function usuarioPorId(id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) return null;
  const auth = (u.auth ?? {}) as AuthJson;
  return { id: u.id, email: u.email, nome: u.name, versaoSessao: auth.sv ?? 0 };
}

export async function credenciaisPorEmail(email: string) {
  const [u] = await db.select().from(users).where(sql`lower(${users.email}) = lower(${email.trim()})`);
  if (!u) return null;
  const auth = (u.auth ?? {}) as AuthJson;
  return { id: u.id, hash: auth.senha, versaoSessao: auth.sv ?? 0 };
}

export async function haUsuarios(): Promise<boolean> {
  const [r] = await db.select({ n: count() }).from(users);
  return r.n > 0;
}

export async function workspacesDoUsuario(userId: string) {
  return db
    .select({ slug: workspaces.slug, name: workspaces.name, papel: workspaceMembers.orgRole })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaces.name));
}

export async function membroDoWorkspace(userId: string, wsSlug: string) {
  const [m] = await db
    .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name, papel: workspaceMembers.orgRole })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.slug, wsSlug)));
  if (!m) return null;
  return { ws: { id: m.id, slug: m.slug, name: m.name }, papel: m.papel as Papel };
}

export async function membrosDoWorkspace(wsId: string) {
  return db
    .select({ id: users.id, nome: users.name, email: users.email })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, wsId))
    .orderBy(asc(users.name));
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

export async function boardsDoWorkspace(wsId: string) {
  const qtd = db
    .select({ boardId: cards.boardId, n: count().as("n") })
    .from(cards)
    .where(isNull(cards.deletedAt))
    .groupBy(cards.boardId)
    .as("qtd");
  return db
    .select({ id: boards.id, slug: boards.slug, name: boards.name, kind: boards.kind, cards: sql<number>`coalesce(${qtd.n}, 0)::int` })
    .from(boards)
    .leftJoin(qtd, eq(qtd.boardId, boards.id))
    .where(and(eq(boards.workspaceId, wsId), isNull(boards.archivedAt)))
    .orderBy(asc(boards.name));
}

function campoUI(f: typeof fields.$inferSelect): CampoUI {
  return {
    id: f.id,
    boardId: f.boardId,
    slug: f.slug,
    name: f.name,
    type: f.type,
    config: (f.config as Record<string, unknown>) ?? {},
    position: f.position,
    requiredExpr: f.requiredExpr,
    visibleExpr: f.visibleExpr,
    defaultValueExpr: f.defaultValueExpr,
    uniqueValue: f.uniqueValue,
    validation: (f.validation as Record<string, unknown> | null) ?? null,
    helpText: f.helpText,
  };
}

async function completar(b: typeof boards.$inferSelect): Promise<BoardCompleto> {
  const [fs, ps] = await Promise.all([
    db.select().from(fields).where(and(eq(fields.boardId, b.id), isNull(fields.archivedAt))).orderBy(asc(fields.position), asc(fields.name)),
    db.select().from(phases).where(and(eq(phases.boardId, b.id), isNull(phases.archivedAt))).orderBy(asc(phases.position)),
  ]);
  return {
    id: b.id,
    workspaceId: b.workspaceId,
    slug: b.slug,
    name: b.name,
    kind: b.kind,
    titleFieldId: b.titleFieldId,
    settings: (b.settings ?? {}) as SettingsBoard,
    fases: ps.map((p) => ({ id: p.id, name: p.name, position: p.position, isTerminal: p.isTerminal, color: p.color })),
    campos: fs.map(campoUI),
  };
}

export async function boardPorSlug(wsId: string, slug: string): Promise<BoardCompleto | null> {
  const [b] = await db
    .select()
    .from(boards)
    .where(and(eq(boards.workspaceId, wsId), eq(boards.slug, slug), isNull(boards.archivedAt)));
  return b ? completar(b) : null;
}

export async function boardPorId(wsId: string, id: string): Promise<BoardCompleto | null> {
  const [b] = await db
    .select()
    .from(boards)
    .where(and(eq(boards.workspaceId, wsId), eq(boards.id, id), isNull(boards.archivedAt)));
  return b ? completar(b) : null;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

const colunasResumo = {
  id: cards.id,
  boardId: cards.boardId,
  title: cards.title,
  phaseId: cards.phaseId,
  status: cards.status,
  props: cards.props,
  computed: cards.computed,
  updatedAt: cards.updatedAt,
  assignees: cards.assignees,
  dueAt: cards.dueAt,
};

export async function cardsDoBoard(boardId: string, limite = 2000): Promise<CardResumo[]> {
  return db
    .select(colunasResumo)
    .from(cards)
    .where(and(eq(cards.boardId, boardId), isNull(cards.deletedAt)))
    .orderBy(desc(cards.updatedAt))
    .limit(limite);
}

export async function cardDoBoard(boardId: string, cardId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(cardId)) return null;
  const [c] = await db
    .select()
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.boardId, boardId), isNull(cards.deletedAt)));
  return c ?? null;
}

/** Busca por título ou início do id, em um board do workspace. */
export async function buscarCards(wsId: string, boardId: string, termo: string, excluir: string[] = []) {
  const t = termo.trim();
  const filtro = t
    ? or(ilike(cards.title, `%${t.replace(/[%_\\]/g, "\\$&")}%`), sql`${cards.id}::text like ${`${t.toLowerCase()}%`}`)
    : undefined;
  return db
    .select({ id: cards.id, title: cards.title })
    .from(cards)
    .where(
      and(
        eq(cards.workspaceId, wsId),
        eq(cards.boardId, boardId),
        isNull(cards.deletedAt),
        filtro,
        excluir.length ? notInArray(cards.id, excluir) : undefined,
      ),
    )
    .orderBy(asc(cards.title))
    .limit(20);
}

export interface Ligados {
  campo: CampoUI;
  /** Board do outro lado da relação. */
  outroBoard: { id: string; slug: string; name: string };
  cards: CardResumo[];
}

/**
 * Relações do card, pelas ligações ativas:
 * - proprias: campos de relação do board do card (card é origem).
 * - inversas: campos de outros boards que apontam para este board (card é destino).
 */
export async function relacoesDoCard(board: BoardCompleto, cardId: string): Promise<{ proprias: Ligados[]; inversas: Ligados[] }> {
  const inversos = (
    await db
      .select()
      .from(fields)
      .where(
        and(
          eq(fields.type, "relation"),
          isNull(fields.archivedAt),
          sql`${fields.config}->'relation'->>'target_board' = ${board.id}`,
          ne(fields.boardId, board.id),
        ),
      )
  ).map(campoUI);
  const proprios = board.campos.filter((c) => c.type === "relation");
  const todos = [...proprios, ...inversos];
  if (!todos.length) return { proprias: [], inversas: [] };

  const links = await db
    .select({ fieldId: cardLinks.fieldId, from: cardLinks.fromCardId, to: cardLinks.toCardId, pos: cardLinks.position })
    .from(cardLinks)
    .where(
      and(
        isNull(cardLinks.deletedAt),
        inArray(cardLinks.fieldId, todos.map((c) => c.id)),
        or(eq(cardLinks.fromCardId, cardId), eq(cardLinks.toCardId, cardId)),
      ),
    )
    .orderBy(asc(cardLinks.position), asc(cardLinks.createdAt));
  const outrosIds = [...new Set(links.map((l) => (l.from === cardId ? l.to : l.from)))];
  const outros = outrosIds.length
    ? await db.select(colunasResumo).from(cards).where(and(inArray(cards.id, outrosIds), isNull(cards.deletedAt)))
    : [];
  const porId = new Map(outros.map((c) => [c.id, c]));

  const boardIds = [
    ...new Set([...proprios.map((c) => String((c.config.relation as { target_board?: string })?.target_board ?? "")), ...inversos.map((c) => c.boardId)]),
  ].filter(Boolean);
  const bs = boardIds.length
    ? await db.select({ id: boards.id, slug: boards.slug, name: boards.name }).from(boards).where(inArray(boards.id, boardIds))
    : [];
  const boardPor = new Map(bs.map((b) => [b.id, b]));
  const vazio = { id: "", slug: "", name: "?" };

  const montar = (campo: CampoUI, outroBoardId: string, pegar: (l: (typeof links)[number]) => string | null): Ligados => ({
    campo,
    outroBoard: boardPor.get(outroBoardId) ?? vazio,
    cards: links
      .filter((l) => l.fieldId === campo.id)
      .map(pegar)
      .flatMap((id): CardResumo[] => {
        const c = id ? porId.get(id) : undefined;
        return c ? [c] : [];
      }),
  });
  return {
    proprias: proprios.map((c) =>
      montar(c, String((c.config.relation as { target_board?: string })?.target_board ?? ""), (l) => (l.from === cardId ? l.to : null)),
    ),
    inversas: inversos.map((c) => montar(c, c.boardId, (l) => (l.to === cardId ? l.from : null))),
  };
}

export async function comentariosDoCard(cardId: string) {
  return db
    .select({ id: cardComments.id, body: cardComments.body, createdAt: cardComments.createdAt, autor: users.name })
    .from(cardComments)
    .leftJoin(users, eq(users.id, cardComments.authorId))
    .where(and(eq(cardComments.cardId, cardId), isNull(cardComments.deletedAt)))
    .orderBy(asc(cardComments.createdAt));
}

export async function eventosDoCard(cardId: string, limite = 200) {
  return db
    .select({
      id: events.id,
      type: events.type,
      data: events.data,
      occurredAt: events.occurredAt,
      actorType: events.actorType,
      ator: users.name,
    })
    .from(events)
    .leftJoin(users, eq(users.id, events.actorId))
    .where(eq(events.cardId, cardId))
    .orderBy(desc(events.occurredAt), desc(events.id))
    .limit(limite);
}

/** Card não excluído de qualquer board do workspace. */
export async function cardDoWorkspace(wsId: string, cardId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(cardId)) return null;
  const [c] = await db
    .select({ ...colunasResumo, boardSlug: boards.slug })
    .from(cards)
    .innerJoin(boards, eq(boards.id, cards.boardId))
    .where(and(eq(cards.id, cardId), eq(cards.workspaceId, wsId), isNull(cards.deletedAt)));
  return c ?? null;
}

/** Títulos de cards por id (inclui excluídos), para o histórico. */
export async function titulosDeCards(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db.select({ id: cards.id, title: cards.title }).from(cards).where(inArray(cards.id, ids));
  return new Map(rows.map((r) => [r.id, r.title]));
}

export async function saudeDoBanco(): Promise<string> {
  const [{ now }] = await db.execute<{ now: string }>(sql`select now()::text as now`);
  return now;
}
