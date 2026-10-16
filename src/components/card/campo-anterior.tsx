"use client";
// Campo do histórico por fase (coluna esquerda do card, prompt PR 2 B2): ícone do tipo + rótulo de 14px,
// valor abaixo recuado 24px; lápis no hover quando a edição é permitida nesta fase (editable_everywhere
// ou override de field_phase_settings). Edita no lugar e salva só ele.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { salvarCamposAction } from "@/app/w/[ws]/actions";
import { CampoInput } from "@/components/card/campo-input";
import { IconeTipo } from "@/components/icone-tipo";
import { Button } from "@/components/ui/button";

export function CampoAnterior({
  ws,
  board,
  cardId,
  campo,
  valor,
  texto,
  editavel,
  pessoas,
  links,
}: {
  ws: string;
  board: string;
  cardId: string;
  campo: { id: string; name: string; type: string; config: Record<string, unknown> };
  valor: unknown;
  /** Valor já formatado para leitura. */
  texto: string;
  editavel: boolean;
  pessoas: Record<string, string>;
  /** Relação: cards ligados, mostrados como links no lugar do texto. */
  links?: { href: string; texto: string }[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const idInput = `anterior-${campo.id}`;

  return (
    <div className="group" data-campo-anterior={campo.name} data-editavel={editavel || undefined}>
      <div className="flex items-center gap-2">
        <dt className="flex min-w-0 flex-1 items-center gap-2 text-sm text-ink-2">
          <IconeTipo tipo={campo.type} className="text-ink-3" />
          {editando ? <label htmlFor={idInput}>{campo.name}</label> : <span className="truncate">{campo.name}</span>}
        </dt>
        {editavel && !editando && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
            aria-label={`Editar ${campo.name}`}
            onClick={() => setEditando(true)}
          >
            <Pencil className="size-3.5" />
          </Button>
        )}
      </div>
      <dd className="mt-0.5 break-words pl-6 text-sm text-ink">
        {editando ? (
          <form
            className="mt-1 flex flex-col gap-2"
            action={(form) =>
              iniciar(async () => {
                const r = await salvarCamposAction(ws, board, cardId, form);
                if (r.ok) {
                  toast.success(`${campo.name} salvo`);
                  setEditando(false);
                  router.refresh();
                } else toast.error("Não foi possível salvar", { description: r.motivo });
              })
            }
          >
            <input type="hidden" name="campos" value={campo.id} />
            <CampoInput campo={campo} valor={valor} pessoas={pessoas} id={idInput} compacto />
            <div className="flex justify-end gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={pendente}>
                {pendente ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        ) : (
          links?.length ? (
            <span className="flex flex-wrap gap-1.5">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="rounded border border-line px-1.5 py-0.5 text-[13px] hover:border-ink-3">
                  {l.texto}
                </Link>
              ))}
            </span>
          ) : (
            texto || <span className="text-ink-3">—</span>
          )
        )}
      </dd>
    </div>
  );
}
