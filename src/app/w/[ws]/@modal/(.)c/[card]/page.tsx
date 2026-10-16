// Card aberto em modal por cima da tela atual (rota interceptada): o board fica montado por baixo, sem
// recarregar. Fechar volta no histórico.
import { CardServidor } from "../../../_card/card-servidor";

export default async function ModalDoCard({ params }: { params: Promise<{ ws: string; card: string }> }) {
  const { ws, card } = await params;
  return <CardServidor ws={ws} cardId={card} modo="modal" />;
}
