import "server-only";
// Visão Lista: páginas de 50 cards ordenadas no servidor, com os mesmos filtros do kanban, e a escolha
// de colunas guardada numa view do board (views.type = 'table', compartilhada).
import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { cards, phases, views } from "@/db/schema";
import { corDaFase } from "@/components/kanban-dados";
import type { FiltrosBoard } from "@/lib/filtros";
import { colunasDisponiveis, ehCalculado, linhasDaLista, type LinhaLista } from "@/lib/lista";
import { duracaoCurta } from "@/lib/tempo";
import { membrosDoWorkspace, type BoardCompleto } from "./consultas";
import { comTitulosDosEspelhos } from "./espelhos";
import { condicoesDoBoard } from "./kanban";

export const POR_PAGINA = 50;

export interface OrdemLista {
  coluna: string;
  dir: "asc" | "desc";
}

export function lerOrdem(sp: Record<string, string | string[] | undefined>): OrdemLista {
  const col = String(Array.isArray(sp.ordem) ? sp.ordem[0] : (sp.ordem ?? ""));
  const dir = String(Array.isArray(sp.dir) ? sp.dir[0] : (sp.dir ?? "")) === "asc" ? "asc" : "desc";
  return { coluna: col || "__atualizacao", dir };
}

/** Expressão de ordenação de uma coluna (sistema ou campo). Valores vazios vão para o fim. */
function ordenacao(board: BoardCompleto, o: OrdemLista): SQL[] {
  const dir = (x: SQL) => (o.dir === "asc" ? sql`${x} asc nulls last` : sql`${x} desc nulls last`);
  switch (o.coluna) {
    case "__fase":
      return [dir(sql`(select ${phases.position} from ${phases} where ${phases.id} = ${cards.phaseId})`)];
    case "__titulo":
      return [dir(sql`lower(${cards.title})`)];
    case "__vencimento": {
      const campo = board.settings.kanban_due_field;
      return [dir(campo ? sql`coalesce(${cards.dueAt}::date::text, nullif(left(${cards.props}->>${campo}, 10), ''))` : sql`${cards.dueAt}`)];
    }
    // Tempo maior = entrou/criou/atualizou antes: inverte a direção da data.
    case "__tempo_fase":
      return [o.dir === "asc" ? sql`${cards.phaseEnteredAt} desc nulls last` : sql`${cards.phaseEnteredAt} asc nulls last`];
    case "__tempo_fluxo":
      return [o.dir === "asc" ? sql`${cards.createdAt} desc` : sql`${cards.createdAt} asc`];
    case "__atualizacao":
      return [o.dir === "asc" ? sql`${cards.updatedAt} desc` : sql`${cards.updatedAt} asc`];
  }
  const campo = board.campos.find((c) => c.id === o.coluna);
  if (!campo) return [];
  const fonte = ehCalculado(campo.type) ? cards.computed : cards.props;
  const v = sql`${fonte}->${campo.id}`;
  // Números como número; o resto como texto minúsculo (datas AAAA-MM-DD ordenam certo como texto).
  return [dir(sql`case when jsonb_typeof(${v}) = 'number' then (${v})::text::numeric end`), dir(sql`lower(${fonte}->>${campo.id})`)];
}

/** Uma página da lista e o total com os filtros. */
export async function paginaDaLista(wsId: string, board: BoardCompleto, f: FiltrosBoard, o: OrdemLista, offset: number): Promise<{ linhas: LinhaLista[]; total: number }> {
  const onde = and(...condicoesDoBoard(board, f));
  const [lidos, [{ n }], membros] = await Promise.all([
    db
      .select({
        id: cards.id,
        title: cards.title,
        phaseId: cards.phaseId,
        status: cards.status,
        props: cards.props,
        computed: cards.computed,
        assignees: cards.assignees,
        dueAt: cards.dueAt,
        phaseEnteredAt: cards.phaseEnteredAt,
        createdAt: cards.createdAt,
        updatedAt: cards.updatedAt,
      })
      .from(cards)
      .where(onde)
      .orderBy(...ordenacao(board, o), desc(cards.updatedAt), asc(cards.id))
      .limit(POR_PAGINA)
      .offset(Math.max(0, offset)),
    db.select({ n: count() }).from(cards).where(onde),
    membrosDoWorkspace(wsId),
  ]);
  const comTitulos = await comTitulosDosEspelhos(wsId, board, lidos);
  const linhas = linhasDaLista(comTitulos, board.campos, {
    fases: new Map(board.fases.map((x, i) => [x.id, { nome: x.name, cor: corDaFase(x.color, i) }])),
    pessoas: new Map(membros.map((m) => [m.id, m.nome])),
    prazoField: board.settings.kanban_due_field,
    duracao: duracaoCurta,
  });
  return { linhas, total: n };
}

/** View da lista do board (a primeira do tipo table): colunas escolhidas em config.columns. */
export async function viewDaLista(board: BoardCompleto) {
  const [v] = await db
    .select({ id: views.id, config: views.config })
    .from(views)
    .where(and(eq(views.boardId, board.id), eq(views.type, "table")))
    .orderBy(asc(views.position))
    .limit(1);
  return v ?? null;
}

/** Salva a escolha e a ordem de colunas (só ids que existem no board). */
export async function salvarColunasDaLista(wsId: string, board: BoardCompleto, colunas: string[], userId: string) {
  const validas = new Set(colunasDisponiveis(board.campos, board.titleFieldId, board.fases.length > 0).map((c) => c.id));
  const ids = [...new Set(colunas.filter((c) => validas.has(c)))];
  if (!ids.length) throw new Error("escolha ao menos uma coluna");
  const atual = await viewDaLista(board);
  if (atual) {
    await db
      .update(views)
      .set({ config: { ...((atual.config as Record<string, unknown>) ?? {}), columns: ids } })
      .where(eq(views.id, atual.id));
  } else {
    await db.insert(views).values({ workspaceId: wsId, boardId: board.id, type: "table", name: "Lista", config: { columns: ids }, ownerId: userId, isShared: true });
  }
  return ids;
}
