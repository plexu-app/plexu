import { redirect } from "next/navigation";
import { Kanban, type CardKanban } from "@/components/kanban";
import { exigirBoard, exigirMembro } from "@/server/acesso";
import { cardsDoBoard } from "@/server/consultas";

export default async function PaginaBoard({ params }: { params: Promise<{ ws: string; board: string }> }) {
  const { ws, board } = await params;
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  // Base (sem fases) abre na tabela.
  if (b.kind !== "workflow" || !b.fases.length) redirect(`/w/${ws}/b/${b.slug}/table`);
  const cards: CardKanban[] = (await cardsDoBoard(b.id)).map((c) => ({ id: c.id, title: c.title, phaseId: c.phaseId }));
  const colunas = b.fases.map((f) => ({ id: f.id, nome: f.name, terminal: f.isTerminal }));
  return <Kanban ws={ws} board={b.slug} colunas={colunas} cards={cards} />;
}
