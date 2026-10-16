// Views do board reutilizadas pelas páginas e pela página direta do card (board por baixo do painel).
// Kanban: 15 cards por fase + contagem por fase; Lista: 50 por página. Filtros e ordenação vêm da URL.
import { Kanban } from "@/components/kanban";
import { corDaFase } from "@/components/kanban-dados";
import { Lista } from "@/components/lista";
import type { FiltrosBoard } from "@/lib/filtros";
import { colunasDisponiveis, colunasVisiveis } from "@/lib/lista";
import type { BoardCompleto } from "@/server/consultas";
import { cartoesDe, contagemPorFase, contextoDosCartoes, paginaDaFase } from "@/server/kanban";
import { paginaDaLista, viewDaLista, type OrdemLista } from "@/server/lista";

export async function VistaKanban({
  ws,
  wsId,
  board,
  filtros,
  podeConfigurar,
}: {
  ws: string;
  wsId: string;
  board: BoardCompleto;
  filtros: FiltrosBoard;
  podeConfigurar: boolean;
}) {
  const [ctx, contagem, paginas] = await Promise.all([
    contextoDosCartoes(board, wsId),
    contagemPorFase(board, filtros),
    Promise.all(board.fases.map((f) => paginaDaFase(board, f.id, filtros, 0))),
  ]);
  const cards = await cartoesDe(ws, wsId, board, paginas.flat(), ctx);
  const colunas = board.fases.map((f, i) => ({
    id: f.id,
    nome: f.name,
    terminal: f.isTerminal,
    cor: corDaFase(f.color, i),
    total: contagem.get(f.id) ?? 0,
    descricao: f.descricao,
    podeCriar: i === 0 || f.allowCreate,
  }));
  return <Kanban ws={ws} board={board.slug} colunas={colunas} cards={cards} filtros={filtros} podeConfigurar={podeConfigurar} />;
}

export async function VistaLista({ ws, wsId, board, filtros, ordem }: { ws: string; wsId: string; board: BoardCompleto; filtros: FiltrosBoard; ordem: OrdemLista }) {
  const comFases = board.fases.length > 0;
  const disponiveis = colunasDisponiveis(board.campos, board.titleFieldId, comFases);
  const [{ linhas, total }, view] = await Promise.all([paginaDaLista(wsId, board, filtros, ordem, 0), viewDaLista(board)]);
  const visiveis = colunasVisiveis(disponiveis, (view?.config as { columns?: unknown } | undefined)?.columns);
  return (
    <Lista
      ws={ws}
      board={board.slug}
      disponiveis={disponiveis}
      visiveis={visiveis}
      linhas={linhas}
      total={total}
      filtros={filtros}
      ordem={ordem}
      fases={board.fases.map((f) => ({ id: f.id, nome: f.name }))}
    />
  );
}
