import { TabelaBoard } from "@/components/tabela-board";
import { colunasDaTabela, linhasDaTabela } from "@/lib/tabela";
import { exigirBoard, exigirMembro } from "@/server/acesso";
import { cardsDoBoard, membrosDoWorkspace } from "@/server/consultas";

export default async function PaginaTabela({ params }: { params: Promise<{ ws: string; board: string }> }) {
  const { ws, board } = await params;
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  const [cards, membros] = await Promise.all([cardsDoBoard(b.id), membrosDoWorkspace(ctx.ws.id)]);
  const campos = b.campos.filter((c) => c.type !== "relation");
  const colunas = colunasDaTabela(campos, b.titleFieldId, b.fases.length > 0);
  const linhas = linhasDaTabela(
    cards,
    campos,
    new Map(b.fases.map((f) => [f.id, f.name])),
    new Map(membros.map((m) => [m.id, m.nome])),
  );
  return <TabelaBoard ws={ws} board={b.slug} colunas={colunas} linhas={linhas} />;
}
