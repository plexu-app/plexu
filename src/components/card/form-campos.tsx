"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Calculator, Lock } from "lucide-react";
import { toast } from "sonner";
import { salvarCamposAction } from "@/app/w/[ws]/actions";
import { CampoInput } from "@/components/card/campo-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { formatarValor } from "@/lib/formatar";

export interface CampoForm {
  campo: { id: string; name: string; type: string; config: Record<string, unknown>; helpText: string | null };
  valor: unknown;
  estado?: { visivel: boolean; editavel: boolean; obrigatorio: boolean; calculado: boolean; travado: boolean; erro?: string };
}

export function FormCampos({
  ws,
  board,
  cardId,
  campos,
  pessoas,
}: {
  ws: string;
  board: string;
  cardId: string;
  campos: CampoForm[];
  pessoas: Record<string, string>;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const mapaPessoas = new Map(Object.entries(pessoas));
  const editaveis = campos.filter((c) => c.estado?.editavel !== false && !c.estado?.calculado);

  return (
    <form
      className="grid grid-cols-2 gap-x-6 gap-y-4"
      action={(form) =>
        iniciar(async () => {
          const r = await salvarCamposAction(ws, board, cardId, form);
          if (r.ok) {
            toast.success("Campos salvos");
            router.refresh();
          } else toast.error("Não foi possível salvar", { description: r.motivo });
        })
      }
    >
      {editaveis.map((c) => (
        <input key={c.campo.id} type="hidden" name="campos" value={c.campo.id} />
      ))}
      {campos.map(({ campo, valor, estado }) => {
        const idInput = `campo-${campo.id}`;
        const calculado = !!estado?.calculado;
        const editavel = !calculado && estado?.editavel !== false;
        const faltando = estado?.obrigatorio && (valor === null || valor === "" || (Array.isArray(valor) && !valor.length));
        return (
          <div key={campo.id} className={campo.type === "long_text" || campo.type === "dynamic_text" ? "col-span-2" : ""} data-campo={campo.name}>
            <div className="mb-1.5 flex items-center gap-2">
              <Label htmlFor={idInput}>
                {campo.name}
                {estado?.obrigatorio && <span className="ml-0.5 text-destructive" aria-label="obrigatório">*</span>}
              </Label>
              {calculado && (
                <Badge variant="calculado" title="Valor calculado automaticamente; não editável">
                  <Calculator className="size-3" /> calculado
                </Badge>
              )}
              {estado?.travado && (
                <Badge variant="outline" title="Travado enquanto houver ligação na relação configurada">
                  <Lock className="size-3" /> travado
                </Badge>
              )}
              {!calculado && !estado?.travado && !editavel && <Badge variant="outline">somente leitura</Badge>}
            </div>
            {editavel ? (
              <CampoInput campo={campo} valor={valor} pessoas={pessoas} id={idInput} obrigatorio={estado?.obrigatorio} />
            ) : (
              <div
                id={idInput}
                className={`min-h-9 rounded-md border px-3 py-2 text-sm ${calculado ? "border-dashed border-primary/30 bg-primary/5" : "bg-muted"}`}
              >
                {formatarValor(campo, valor, mapaPessoas) || <span className="text-muted-foreground">—</span>}
              </div>
            )}
            {faltando && <p className="mt-1 text-xs text-destructive">Obrigatório nesta fase</p>}
            {campo.helpText && <p className="mt-1 text-xs text-muted-foreground">{campo.helpText}</p>}
            {estado?.erro && <p className="mt-1 text-xs text-destructive">Expressão do campo com erro: {estado.erro}</p>}
          </div>
        );
      })}
      {editaveis.length > 0 && (
        <div className="col-span-2 flex justify-end">
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar campos"}
          </Button>
        </div>
      )}
    </form>
  );
}
