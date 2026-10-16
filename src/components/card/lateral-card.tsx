"use client";
// Coluna direita do card aberto (prompt PR 2, B2): "Mover card para fase" com uma pill por destino
// permitido (cor da fase: fundo 10%, borda 35%, texto escurecido; no escuro, clareado), a fase anterior
// como pill neutra, e destinos travados por obrigatório vazio desabilitados com o motivo uma vez só.
// Destinos recusados por regra (can_enter/can_leave/can_back) nem aparecem: o servidor resolve antes.
// Abaixo: responsável, prazo, ações, copiar link e excluir.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowLeft, ArrowRight, CalendarClock, Link2, Settings2, Trash, UserRound } from "lucide-react";
import { toast } from "sonner";
import { excluirCardAction, moverCardAction } from "@/app/w/[ws]/actions";
import { Button } from "@/components/ui/button";
import { destinosVisiveis } from "@/lib/movimentos";
import { hrefCard } from "@/lib/rotas";
import { cn } from "@/lib/utils";

export interface MovimentoUI {
  faseId: string;
  nome: string;
  cor: string;
  permitido: boolean;
  motivo?: string;
  /** Bloqueado por campo obrigatório vazio (aparece desabilitado com o motivo). */
  obrigatorios?: boolean;
  /** Destino antes da fase atual (voltar). */
  volta: boolean;
  /** A fase imediatamente anterior (a única de volta que aparece). */
  anterior: boolean;
}

const Titulo = ({ children }: { children: React.ReactNode }) => <h3 className="mb-2 text-[13px] font-semibold text-ink">{children}</h3>;

/** Estilo da pill derivado da cor da fase. */
const corPill = (cor: string): React.CSSProperties => ({
  background: `color-mix(in srgb, ${cor} 10%, transparent)`,
  borderColor: `color-mix(in srgb, ${cor} 35%, transparent)`,
  color: `color-mix(in srgb, ${cor} 62%, var(--ink))`,
});

export function LateralCard({
  ws,
  board,
  cardId,
  movimentos,
  responsavel,
  prazo,
  voltarPara,
  configurarMovimentacao,
  acoes,
}: {
  ws: string;
  board: string;
  cardId: string;
  movimentos: MovimentoUI[] | null;
  responsavel: string | null;
  prazo: { texto: string; atrasado: boolean } | null;
  voltarPara: string;
  /** Link para as regras de movimentação (só quem configura). */
  configurarMovimentacao: string | null;
  acoes: React.ReactNode;
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

  const { frente, anterior } = destinosVisiveis(movimentos ?? []);

  return (
    <>
      {movimentos && (
        <section data-testid="mover-card">
          <Titulo>Mover card para fase</Titulo>
          <ul className="flex flex-col gap-2">
            {frente.map((m) => {
              const motivo = m.motivoVisivel;
              const idMotivo = `motivo-${m.faseId}`;
              return (
                <li key={m.faseId} data-mover={m.nome} data-permitido={m.permitido}>
                  <button
                    type="button"
                    disabled={pendente || !m.permitido}
                    aria-label={`Mover para ${m.nome}`}
                    aria-describedby={motivo ? idMotivo : undefined}
                    onClick={() => mover(m)}
                    className="flex h-[34px] w-full items-center justify-between gap-2 rounded border px-3 py-2 text-[13px] font-medium transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-55"
                    style={corPill(m.cor)}
                  >
                    <span className="truncate">{m.nome}</span>
                    <ArrowRight className="size-4 shrink-0" aria-hidden />
                  </button>
                  {motivo && (
                    <p id={idMotivo} className="mt-1 text-xs text-ink-2" data-motivo-mover>
                      {motivo}
                    </p>
                  )}
                </li>
              );
            })}
            {anterior && (
              <li data-mover={anterior.nome} data-permitido>
                <button
                  type="button"
                  disabled={pendente}
                  aria-label={`Voltar para ${anterior.nome}`}
                  onClick={() => mover(anterior)}
                  className="flex h-[34px] w-full items-center gap-2 rounded border border-line bg-paper px-3 py-2 text-[13px] text-ink-2 hover:bg-bg hover:text-ink disabled:opacity-55"
                >
                  <ArrowLeft className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{anterior.nome}</span>
                </button>
              </li>
            )}
            {!frente.length && !anterior && <li className="text-xs text-ink-3">Nenhuma fase disponível agora.</li>}
          </ul>
          {configurarMovimentacao && (
            <Link href={configurarMovimentacao} className="mt-2 inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
              <Settings2 className="size-3.5" /> Configurar movimentação
            </Link>
          )}
        </section>
      )}

      <section>
        <Titulo>Responsável</Titulo>
        <p className="flex items-center gap-2 text-sm" data-testid="responsavel-card">
          <UserRound className="size-4 text-ink-3" />
          {responsavel ?? <span className="text-ink-3">ninguém</span>}
        </p>
      </section>

      <section>
        <Titulo>Prazo</Titulo>
        <p className={cn("flex items-center gap-2 text-sm", prazo?.atrasado && "font-medium text-err")} data-testid="prazo-card">
          <CalendarClock className="size-4 text-ink-3" />
          {prazo ? `${prazo.texto}${prazo.atrasado ? " (atrasado)" : ""}` : <span className="text-ink-3">sem prazo</span>}
        </p>
      </section>

      {acoes}

      <section className="mt-auto flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-start"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${location.origin}${hrefCard(ws, cardId)}`);
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
          className="justify-start text-err"
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
          <Trash /> Excluir card
        </Button>
      </section>
    </>
  );
}
