// Página do card (link direto ou recarga): o mesmo card aberto, como página dentro do workspace.
// Vindo do board, a navegação é interceptada por @modal/(.)c/[card] e o card abre em modal por cima.
import { CardServidor } from "../../_card/card-servidor";

export default async function PaginaDoCard({ params }: { params: Promise<{ ws: string; card: string }> }) {
  const { ws, card } = await params;
  return <CardServidor ws={ws} cardId={card} modo="pagina" />;
}
