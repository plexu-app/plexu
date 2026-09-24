"use client";
// Campo de fase anterior na coluna esquerda do card: leitura, com "editar" quando a edição é permitida
// nesta fase (editable_everywhere ou override de field_phase_settings). Edita inline e salva só ele.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { salvarCamposAction } from "@/app/w/[ws]/actions";
import { CampoInput } from "@/components/card/campo-input";
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
    <div data-campo-anterior={campo.name} data-editavel={editavel || undefined}>
      <div className="flex items-center justify-between gap-2">
        <dt className="text-xs text-muted-foreground">
          {editando ? <label htmlFor={idInput}>{campo.name}</label> : campo.name}
        </dt>
        {editavel && !editando && (
          <Button type="button" variant="ghost" size="icon" className="size-6" aria-label={`Editar ${campo.name}`} onClick={() => setEditando(true)}>
            <Pencil className="size-3.5" />
          </Button>
        )}
      </div>
      <dd className="text-sm break-words">
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
            <span className="flex flex-wrap gap-x-2">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="text-primary-strong hover:underline">
                  {l.texto}
                </Link>
              ))}
            </span>
          ) : (
            texto || <span className="text-muted-foreground">—</span>
          )
        )}
      </dd>
    </div>
  );
}
