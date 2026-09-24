"use client";
// Painel lateral do card: cabeçalho (título, id curto, fase, mover) e abas.
// Fechar navega para a view de origem (kanban ou tabela).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoverPara } from "@/components/card/mover-para";
import { Dialog, DialogDescription, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/misc";
import { idCurto } from "@/lib/formatar";
import { cn } from "@/lib/utils";

type Aba = "campos" | "relacionados" | "comentarios" | "historico";
const ROTULOS: Record<Aba, string> = { campos: "Campos", relacionados: "Relacionados", comentarios: "Comentários", historico: "Histórico" };

export function SheetCard({
  ws,
  board,
  cardId,
  titulo,
  fase,
  fases,
  status,
  voltarPara,
  abas,
  contagens,
}: {
  ws: string;
  board: string;
  cardId: string;
  titulo: string;
  fase: { id: string; nome: string } | null;
  fases: { id: string; nome: string }[];
  status: string;
  voltarPara: string;
  abas: Record<Aba, React.ReactNode>;
  contagens: { relacionados: number; comentarios: number };
}) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("campos");
  const fechar = () => router.push(voltarPara, { scroll: false });

  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <SheetContent aria-describedby={undefined} data-testid="painel-card">
        <header className="flex flex-col gap-3 border-b px-6 pb-0 pt-5">
          <div className="flex items-start gap-3 pr-8">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-lg" data-testid="titulo-card">
                {titulo}
              </DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground" title={cardId}>
                  {idCurto(cardId)}
                </span>
                {fase && (
                  <Badge variant="secondary" data-testid="fase-card">
                    {fase.nome}
                  </Badge>
                )}
                {status !== "open" && <Badge variant="outline">{status === "done" ? "concluído" : "cancelado"}</Badge>}
              </DialogDescription>
            </div>
            {fases.length > 0 && <MoverPara key={fase?.id ?? ""} ws={ws} board={board} cardId={cardId} faseAtual={fase?.id ?? null} fases={fases} />}
          </div>
          <nav role="tablist" aria-label="Seções do card" className="-mb-px flex gap-1">
            {(Object.keys(ROTULOS) as Aba[]).map((a) => (
              <button
                key={a}
                role="tab"
                type="button"
                aria-selected={aba === a}
                onClick={() => setAba(a)}
                className={cn(
                  "border-b-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground",
                  aba === a ? "border-primary font-medium text-foreground" : "border-transparent",
                )}
              >
                {ROTULOS[a]}
                {a === "relacionados" && contagens.relacionados > 0 && <span className="ml-1 text-xs">({contagens.relacionados})</span>}
                {a === "comentarios" && contagens.comentarios > 0 && <span className="ml-1 text-xs">({contagens.comentarios})</span>}
              </button>
            ))}
          </nav>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {(Object.keys(ROTULOS) as Aba[]).map((a) => (
            <section key={a} role="tabpanel" aria-label={ROTULOS[a]} hidden={aba !== a}>
              {abas[a]}
            </section>
          ))}
        </div>
      </SheetContent>
    </Dialog>
  );
}
