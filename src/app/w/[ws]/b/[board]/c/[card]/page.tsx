// Endereço antigo do card (por board): redireciona para /w/[ws]/c/[card].
import { redirect } from "next/navigation";

export default async function CardEnderecoAntigo({ params }: { params: Promise<{ ws: string; card: string }> }) {
  const { ws, card } = await params;
  redirect(`/w/${ws}/c/${card}`);
}
