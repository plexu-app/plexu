"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { moverCardAction } from "@/app/w/[ws]/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";

/** Alternativa acessível ao arrastar: escolher a fase e mover. */
export function MoverPara({
  ws,
  board,
  cardId,
  faseAtual,
  fases,
}: {
  ws: string;
  board: string;
  cardId: string;
  faseAtual: string | null;
  fases: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const outras = fases.filter((f) => f.id !== faseAtual);
  const [destino, setDestino] = useState(outras[0]?.id ?? "");
  const [pendente, iniciar] = useTransition();
  if (!outras.length) return null;
  return (
    <div className="flex items-center gap-2">
      <NativeSelect aria-label="Mover para a fase" className="w-48" value={destino} onChange={(e) => setDestino(e.target.value)}>
        {outras.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nome}
          </option>
        ))}
      </NativeSelect>
      <Button
        variant="outline"
        disabled={pendente || !destino}
        onClick={() =>
          iniciar(async () => {
            const r = await moverCardAction(ws, board, cardId, destino);
            if (r.ok) {
              toast.success("Card movido");
              router.refresh();
            } else toast.error("Não foi possível mover", { description: r.motivo });
          })
        }
      >
        Mover
      </Button>
    </div>
  );
}
