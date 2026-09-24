import { exigirBoard, exigirMembro } from "@/server/acesso";
import { VistaTabela } from "../_views/vistas";

export default async function PaginaTabela({ params }: { params: Promise<{ ws: string; board: string }> }) {
  const { ws, board } = await params;
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  return <VistaTabela ws={ws} wsId={ctx.ws.id} board={b} />;
}
