// Card aberto: a view do board por baixo (kanban ou tabela, conforme ?v=) e o painel lateral por cima.
// A URL é compartilhável; fechar volta à view de origem.
import { exigirBoard, exigirMembro } from "@/server/acesso";
import { PainelCard } from "../../_card/painel";
import { VistaKanban, VistaTabela } from "../../_views/vistas";

export default async function PaginaCard({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; board: string; card: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { ws, board, card } = await params;
  const { v } = await searchParams;
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  const tabela = v === "tabela" || b.kind !== "workflow" || !b.fases.length;
  return (
    <>
      {tabela ? <VistaTabela ws={ws} wsId={ctx.ws.id} board={b} /> : <VistaKanban ws={ws} board={b} />}
      <PainelCard ws={ws} board={board} cardId={card} voltarPara={tabela ? `/w/${ws}/b/${b.slug}/table` : `/w/${ws}/b/${b.slug}`} />
    </>
  );
}
