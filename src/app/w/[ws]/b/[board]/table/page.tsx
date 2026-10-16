import { lerFiltros } from "@/lib/filtros";
import { exigirBoard, exigirMembro } from "@/server/acesso";
import { lerOrdem } from "@/server/lista";
import { VistaLista } from "../_views/vistas";

type Busca = Promise<Record<string, string | string[] | undefined>>;

/** Visão Lista (rota /table mantida: links e bases já apontam para ela). */
export default async function PaginaLista({ params, searchParams }: { params: Promise<{ ws: string; board: string }>; searchParams: Busca }) {
  const { ws, board } = await params;
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  const sp = await searchParams;
  return <VistaLista ws={ws} wsId={ctx.ws.id} board={b} filtros={lerFiltros(sp)} ordem={lerOrdem(sp)} />;
}
