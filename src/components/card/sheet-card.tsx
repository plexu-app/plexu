"use client";
// Painel do card em 3 colunas: esquerda = campos de fases anteriores (leitura, por fase, recolhíveis);
// centro = formulário da fase atual; direita = mover, responsável, prazo e ações. Abaixo, em abas:
// relacionados, comentários e histórico. Em telas < 1100px as colunas empilham.
// Fechar navega para a view de origem (kanban ou tabela).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog, DialogDescription, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/misc";
import { idCurto } from "@/lib/formatar";
import { cn } from "@/lib/utils";

type Aba = "relacionados" | "comentarios" | "historico";
const ROTULOS: Record<Aba, string> = { relacionados: "Relacionados", comentarios: "Comentários", historico: "Histórico" };

export function SheetCard({
  cardId,
  titulo,
  fase,
  status,
  voltarPara,
  anteriores,
  atual,
  lateral,
  abas,
  contagens,
}: {
  cardId: string;
  titulo: string;
  fase: { id: string; nome: string } | null;
  status: string;
  voltarPara: string;
  /** Coluna esquerda; null em board sem fases. */
  anteriores: React.ReactNode | null;
  atual: React.ReactNode;
  lateral: React.ReactNode;
  abas: Record<Aba, React.ReactNode>;
  contagens: { relacionados: number; comentarios: number };
}) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("relacionados");
  const fechar = () => router.push(voltarPara, { scroll: false });

  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <SheetContent aria-describedby={undefined} data-testid="painel-card" className="w-[min(1320px,100vw)]">
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-14">
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
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div
            data-testid="colunas-card"
            className={cn(
              "grid grid-cols-1 gap-6",
              anteriores !== null ? "min-[1100px]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_16rem]" : "min-[1100px]:grid-cols-[minmax(0,1fr)_16rem]",
            )}
          >
            {anteriores !== null && (
              <section aria-label="Fases anteriores" data-testid="coluna-anteriores" className="flex min-w-0 flex-col gap-3">
                {anteriores}
              </section>
            )}
            <section aria-label={fase ? `Fase atual: ${fase.nome}` : "Campos"} data-testid="coluna-atual" className="min-w-0">
              {atual}
            </section>
            <aside aria-label="Ações do card" data-testid="coluna-lateral" className="flex min-w-0 flex-col gap-5">
              {lateral}
            </aside>
          </div>

          <div className="mt-8 border-t">
            <nav role="tablist" aria-label="Seções do card" className="-mt-px flex gap-1">
              {(Object.keys(ROTULOS) as Aba[]).map((a) => (
                <button
                  key={a}
                  role="tab"
                  type="button"
                  aria-selected={aba === a}
                  onClick={() => setAba(a)}
                  className={cn(
                    "border-t-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground",
                    aba === a ? "border-primary font-medium text-foreground" : "border-transparent",
                  )}
                >
                  {ROTULOS[a]}
                  {a === "relacionados" && contagens.relacionados > 0 && <span className="ml-1 text-xs">({contagens.relacionados})</span>}
                  {a === "comentarios" && contagens.comentarios > 0 && <span className="ml-1 text-xs">({contagens.comentarios})</span>}
                </button>
              ))}
            </nav>
            <div className="pt-4">
              {(Object.keys(ROTULOS) as Aba[]).map((a) => (
                <section key={a} role="tabpanel" aria-label={ROTULOS[a]} hidden={aba !== a}>
                  {abas[a]}
                </section>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Dialog>
  );
}
