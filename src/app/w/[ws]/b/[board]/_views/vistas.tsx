// Views do board reutilizadas pelas páginas e pela página direta do card (board por baixo do painel).
import { Kanban } from "@/components/kanban";
import { corDaFase, montarCartoes } from "@/components/kanban-dados";
import { TabelaBoard } from "@/components/tabela-board";
import { colunasDaTabela, linhasDaTabela } from "@/lib/tabela";
import { cardsDoBoard, membrosDoWorkspace, type BoardCompleto } from "@/server/consultas";

export async function VistaKanban({ ws, wsId, board }: { ws: string; wsId: string; board: BoardCompleto }) {
  const [lista, membros] = await Promise.all([cardsDoBoard(board.id), membrosDoWorkspace(wsId)]);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const cards = montarCartoes(lista, board.campos, {
    titleFieldId: board.titleFieldId,
    kanbanFields: board.settings.kanban_fields,
    prazoField: board.settings.kanban_due_field,
    pessoas: new Map(membros.map((m) => [m.id, m.nome])),
    hoje,
  });
  const colunas = board.fases.map((f, i) => ({ id: f.id, nome: f.name, terminal: f.isTerminal, cor: corDaFase(f.color, i) }));
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
