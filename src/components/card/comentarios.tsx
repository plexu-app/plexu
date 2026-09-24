"use client";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { comentarAction } from "@/app/w/[ws]/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";

export function Comentarios({
  ws,
  board,
  cardId,
  itens,
}: {
  ws: string;
  board: string;
  cardId: string;
  itens: { id: string; body: string; autor: string; quando: string }[];
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Comentários</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-3 text-sm">
          {itens.map((c) => (
            <li key={c.id}>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.autor}</span> · {c.quando}
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
          {itens.length === 0 && <li className="text-muted-foreground">Sem comentários.</li>}
        </ul>
        <form
          ref={form}
          className="flex flex-col gap-2"
          action={(f) =>
            iniciar(async () => {
              const r = await comentarAction(ws, board, cardId, f);
              if (r.ok) {
                form.current?.reset();
                router.refresh();
              } else toast.error("Não foi possível comentar", { description: r.motivo });
            })
          }
        >
          <Textarea name="body" aria-label="Novo comentário" placeholder="Escreva um comentário…" required maxLength={10000} />
          <Button type="submit" size="sm" className="self-end" disabled={pendente}>
            Comentar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
