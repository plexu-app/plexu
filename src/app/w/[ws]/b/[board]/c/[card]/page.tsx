// Card aberto: a view do board por baixo (kanban ou lista, conforme ?v=) e o painel por cima.
// A URL é compartilhável; fechar volta à view de origem.
import { lerFiltros } from "@/lib/filtros";
import { exigirBoard, exigirMembro, podeConfigurar } from "@/server/acesso";
import { lerOrdem } from "@/server/lista";
import { PainelCard } from "../../_card/painel";
import { VistaKanban, VistaLista } from "../../_views/vistas";

export default async function PaginaCard({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; board: string; card: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ws, board, card } = await params;
  const sp = await searchParams;
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  const tabela = sp.v === "tabela" || b.kind !== "workflow" || !b.fases.length;
  const filtros = lerFiltros(sp);
  return (
    <>
      {tabela ? (
        <VistaLista ws={ws} wsId={ctx.ws.id} board={b} filtros={filtros} ordem={lerOrdem(sp)} />
      ) : (
        <VistaKanban ws={ws} wsId={ctx.ws.id} board={b} filtros={filtros} podeConfigurar={podeConfigurar(ctx)} />
      )}
      <PainelCard ws={ws} board={board} cardId={card} voltarPara={tabela ? `/w/${ws}/b/${b.slug}/table` : `/w/${ws}/b/${b.slug}`} />
    </>
  );
}
