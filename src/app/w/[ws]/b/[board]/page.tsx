import { redirect } from "next/navigation";
import { exigirBoard, exigirMembro } from "@/server/acesso";
import { VistaKanban } from "./_views/vistas";

export default async function PaginaBoard({ params }: { params: Promise<{ ws: string; board: string }> }) {
  const { ws, board } = await params;
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  // Base (sem fases) abre na tabela.
  if (b.kind !== "workflow" || !b.fases.length) redirect(`/w/${ws}/b/${b.slug}/table`);
  return <VistaKanban ws={ws} wsId={ctx.ws.id} board={b} />;
}
