// Views do board reutilizadas pelas páginas e pela página direta do card (board por baixo do painel).
import { Kanban, type CardKanban } from "@/components/kanban";
import { TabelaBoard } from "@/components/tabela-board";
import { colunasDaTabela, linhasDaTabela } from "@/lib/tabela";
import { cardsDoBoard, membrosDoWorkspace, type BoardCompleto } from "@/server/consultas";

export async function VistaKanban({ ws, board }: { ws: string; board: BoardCompleto }) {
  const cards: CardKanban[] = (await cardsDoBoard(board.id)).map((c) => ({ id: c.id, title: c.title, phaseId: c.phaseId }));
  const colunas = board.fases.map((f) => ({ id: f.id, nome: f.name, terminal: f.isTerminal }));
  return <Kanban ws={ws} board={board.slug} colunas={colunas} cards={cards} />;
}

export async function VistaTabela({ ws, wsId, board }: { ws: string; wsId: string; board: BoardCompleto }) {
  const [cards, membros] = await Promise.all([cardsDoBoard(board.id), membrosDoWorkspace(wsId)]);
  const campos = board.campos.filter((c) => c.type !== "relation");
  const colunas = colunasDaTabela(campos, board.titleFieldId, board.fases.length > 0);
  const linhas = linhasDaTabela(
    cards,
    campos,
    new Map(board.fases.map((f) => [f.id, f.name])),
    new Map(membros.map((m) => [m.id, m.nome])),
  );
  return <TabelaBoard ws={ws} board={board.slug} colunas={colunas} linhas={linhas} />;
}
