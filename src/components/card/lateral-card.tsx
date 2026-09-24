"use client";
// Coluna direita do card: mover (um botão por fase; bloqueadas mostram o motivo), responsável,
// prazo e ações. A permissão de cada movimento vem do core (movimentosDoCard); o servidor
// reavalia ao mover.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowLeft, ArrowRight, CalendarClock, Link2, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { excluirCardAction, moverCardAction } from "@/app/w/[ws]/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MovimentoUI {
  faseId: string;
  nome: string;
  permitido: boolean;
  motivo?: string;
  /** Destino antes da fase atual (voltar). */
  volta: boolean;
}

const Titulo = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>
);

export function LateralCard({
  ws,
  board,
  cardId,
  movimentos,
  responsavel,
  prazo,
  voltarPara,
}: {
  ws: string;
  board: string;
  cardId: string;
  movimentos: MovimentoUI[] | null;
  responsavel: string | null;
  prazo: { texto: string; atrasado: boolean } | null;
  voltarPara: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const mover = (m: MovimentoUI) =>
    iniciar(async () => {
      const r = await moverCardAction(ws, board, cardId, m.faseId);
      if (r.ok) {
        toast.success(`Card movido para ${m.nome}`);
        router.refresh();
      } else toast.error("Não foi possível mover", { description: r.motivo });
    });

  return (
    <>
      {movimentos && movimentos.length > 0 && (
        <section data-testid="mover-card">
          <Titulo>Mover</Titulo>
          <ul className="flex flex-col gap-2">
            {movimentos.map((m) => {
              const idMotivo = `motivo-${m.faseId}`;
              return (
                <li key={m.faseId} data-mover={m.nome} data-permitido={m.permitido}>
                  <Button
                    type="button"
                    variant={m.permitido && !m.volta ? "default" : "outline"}
                    size="sm"
                    className="w-full justify-start"
                    disabled={pendente || !m.permitido}
                    aria-describedby={m.motivo ? idMotivo : undefined}
                    onClick={() => mover(m)}
                  >
                    {m.volta ? <ArrowLeft /> : <ArrowRight />}
                    {m.volta ? `Voltar para ${m.nome}` : `Mover para ${m.nome}`}
                  </Button>
                  {m.motivo && (
                    <p id={idMotivo} className={cn("mt-1 text-xs", m.permitido ? "text-muted-foreground" : "text-destructive-strong")}>
                      {m.motivo}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <Titulo>Responsável</Titulo>
        <p className="flex items-center gap-2 text-sm" data-testid="responsavel-card">
          <UserRound className="size-4 text-muted-foreground" />
          {responsavel ?? <span className="text-muted-foreground">ninguém</span>}
        </p>
      </section>

      <section>
        <Titulo>Prazo</Titulo>
        <p className={cn("flex items-center gap-2 text-sm", prazo?.atrasado && "font-medium text-destructive-strong")} data-testid="prazo-card">
          <CalendarClock className="size-4 text-muted-foreground" />
          {prazo ? `${prazo.texto}${prazo.atrasado ? " (atrasado)" : ""}` : <span className="text-muted-foreground">sem prazo</span>}
        </p>
      </section>

      <section>
        <Titulo>Ações</Titulo>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                toast.success("Link copiado");
              } catch {
                toast.error("Não foi possível copiar o link");
              }
            }}
          >
            <Link2 /> Copiar link
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start text-destructive-strong"
            disabled={pendente}
            onClick={() => {
              if (!window.confirm("Excluir este card?")) return;
              iniciar(async () => {
                const r = await excluirCardAction(ws, board, cardId);
                if (r.ok) {
                  toast.success("Card excluído");
                  router.push(voltarPara, { scroll: false });
                } else toast.error("Não foi possível excluir", { description: r.motivo });
              });
            }}
          >
            <Trash2 /> Excluir card
          </Button>
        </div>
      </section>
    </>
  );
}
