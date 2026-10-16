import "server-only";
// Leituras do kanban e da lista com paginação no servidor: contagem por fase separada (count(*)),
// páginas de cards por fase e os extras do cartão (comentários, anexos, conexões) agregados por página.
import { and, asc, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { attachments, boards, cardComments, cardLinks, cards } from "@/db/schema";
import { montarCartoes, type CartaoKanban, type ConexaoCartao, type ExtrasCartoes } from "@/components/kanban-dados";
import { coresDosBoards } from "@/lib/cores";
import type { FiltrosBoard } from "@/lib/filtros";
import { tituloOu } from "@/lib/formatar";
import { hrefCard } from "@/lib/rotas";
import { boardsDoWorkspace, membrosDoWorkspace, type BoardCompleto, type CardResumo } from "./consultas";
import { comTitulosDosEspelhos } from "./espelhos";

/** Cards por fase na primeira carga e a cada rolagem. */
export const POR_FASE = 15;

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

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
  phaseEnteredAt: cards.phaseEnteredAt,
  createdAt: cards.createdAt,
};

/** Condições SQL dos filtros da URL (src/lib/filtros.ts), mais "não excluído" e o board. */
export function condicoesDoBoard(board: BoardCompleto, f: FiltrosBoard): SQL[] {
  const cs: SQL[] = [eq(cards.boardId, board.id), isNull(cards.deletedAt)];
  if (f.q) {
    const termo = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    // Sem acento e sem caixa (f_unaccent, migração 0006); o termo vai como parâmetro, nunca concatenado.
    const t = sql`f_unaccent(${termo})`;
    cs.push(sql`(f_unaccent(${cards.title}) ilike ${t} or f_unaccent(${cards.props}::text) ilike ${t} or f_unaccent(${cards.computed}::text) ilike ${t})`);
  }
  if (f.resp) {
    // assignees ou qualquer campo pessoa (valor único ou lista) com o id
    cs.push(
      sql`(${cards.assignees} @> array[${f.resp}]::uuid[] or exists (select 1 from jsonb_each(${cards.props}) e where e.value = to_jsonb(${f.resp}::text) or (jsonb_typeof(e.value) = 'array' and e.value @> jsonb_build_array(${f.resp}::text))))`,
    );
  }
  if (f.atrasados) {
    const hoje = hojeSP();
    const campo = board.settings.kanban_due_field;
    const pelaData = sql`(${cards.dueAt} at time zone 'America/Sao_Paulo')::date < ${hoje}::date`;
    cs.push(
      campo
        ? sql`${cards.status} = 'open' and (${pelaData} or (${cards.dueAt} is null and coalesce(${cards.props}->>${campo}, '') <> '' and left(${cards.props}->>${campo}, 10) < ${hoje}))`
        : sql`${cards.status} = 'open' and ${pelaData}`,
    );
  }
  return cs;
}

/** Quantos cards (com os filtros) há em cada fase. */
export async function contagemPorFase(board: BoardCompleto, f: FiltrosBoard): Promise<Map<string, number>> {
  const rows = await db
    .select({ fase: cards.phaseId, n: count() })
    .from(cards)
    .where(and(...condicoesDoBoard(board, f)))
    .groupBy(cards.phaseId);
  return new Map(rows.flatMap((r) => (r.fase ? [[r.fase, r.n] as const] : [])));
}

/** Uma página de cards da fase: mais recentes primeiro (atualização), id como desempate estável. */
export async function paginaDaFase(board: BoardCompleto, faseId: string, f: FiltrosBoard, offset: number, limite = POR_FASE): Promise<CardResumo[]> {
  return db
    .select(colunasResumo)
    .from(cards)
    .where(and(...condicoesDoBoard(board, f), eq(cards.phaseId, faseId)))
    .orderBy(desc(cards.updatedAt), desc(cards.id))
    .limit(limite)
    .offset(Math.max(0, offset));
}

/** Relações N:1 do board marcadas "mostrar no card" (config.relation.show_on_card). */
const relacoesNoCartao = (board: BoardCompleto) =>
  board.campos.filter((c) => {
    const r = (c.config.relation ?? {}) as { cardinality?: string; show_on_card?: boolean };
    return c.type === "relation" && r.cardinality === "one" && r.show_on_card === true;
  });

/** Comentários, anexos e conexões dos cards de uma página (três consultas agregadas). */
export async function extrasDosCards(ws: string, wsId: string, board: BoardCompleto, ids: string[]): Promise<ExtrasCartoes> {
  if (!ids.length) return {};
  const relacoes = relacoesNoCartao(board);
  const [coms, anx, links, todos] = await Promise.all([
    db
      .select({ card: cardComments.cardId, n: count() })
      .from(cardComments)
      .where(and(inArray(cardComments.cardId, ids), isNull(cardComments.deletedAt)))
      .groupBy(cardComments.cardId),
    db.select({ card: attachments.cardId, n: count() }).from(attachments).where(inArray(attachments.cardId, ids)).groupBy(attachments.cardId),
    relacoes.length
      ? db
          .select({ de: cardLinks.fromCardId, campo: cardLinks.fieldId, para: cards.id, titulo: cards.title, boardId: cards.boardId, boardSlug: boards.slug, boardNome: boards.name })
          .from(cardLinks)
          .innerJoin(cards, eq(cards.id, cardLinks.toCardId))
          .innerJoin(boards, eq(boards.id, cards.boardId))
          .where(
            and(
              inArray(cardLinks.fromCardId, ids),
              inArray(cardLinks.fieldId, relacoes.map((r) => r.id)),
              isNull(cardLinks.deletedAt),
              isNull(cards.deletedAt),
            ),
          )
          .orderBy(asc(cardLinks.position))
      : Promise.resolve([]),
    relacoes.length ? boardsDoWorkspace(wsId) : Promise.resolve([]),
  ]);
  const cores = coresDosBoards(todos);
  const ordemCampo = new Map(relacoes.map((r, i) => [r.id, i]));
  const conexoes = new Map<string, ConexaoCartao[]>();
  for (const l of [...links].sort((a, b) => (ordemCampo.get(a.campo) ?? 0) - (ordemCampo.get(b.campo) ?? 0))) {
    const lista = conexoes.get(l.de) ?? [];
    lista.push({ board: l.boardNome, cor: cores.get(l.boardId) ?? "var(--f5)", id: l.para, titulo: tituloOu(l.titulo, l.para), href: hrefCard(ws, l.para) });
    conexoes.set(l.de, lista);
  }
  return {
    comentarios: new Map(coms.map((r) => [r.card, r.n])),
    anexos: new Map(anx.flatMap((r) => (r.card ? [[r.card, r.n] as const] : []))),
    conexoes,
  };
}

/** Contexto que todo cartão do board precisa (pessoas, SLA das fases, hoje). */
export async function contextoDosCartoes(board: BoardCompleto, wsId: string) {
  const membros = await membrosDoWorkspace(wsId);
  return {
    pessoas: new Map(membros.map((m) => [m.id, m.nome])),
    slaPorFase: new Map(board.fases.map((f) => [f.id, f.sla])),
    hoje: hojeSP(),
  };
}

/** Cartões prontos para desenhar a partir de cards já lidos. */
export async function cartoesDe(ws: string, wsId: string, board: BoardCompleto, lista: CardResumo[], ctx?: Awaited<ReturnType<typeof contextoDosCartoes>>): Promise<CartaoKanban[]> {
  const [c, extras, comTitulos] = await Promise.all([
    ctx ?? contextoDosCartoes(board, wsId),
    extrasDosCards(ws, wsId, board, lista.map((x) => x.id)),
    comTitulosDosEspelhos(wsId, board, lista),
  ]);
  return montarCartoes(comTitulos, board.campos, {
    titleFieldId: board.titleFieldId,
    kanbanFields: board.settings.kanban_fields,
    prazoField: board.settings.kanban_due_field,
    pessoas: c.pessoas,
    slaPorFase: c.slaPorFase,
    hoje: c.hoje,
    extras,
  });
}
