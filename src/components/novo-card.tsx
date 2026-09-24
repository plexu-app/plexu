"use client";
// Criar card = formulário da fase: campos visíveis/editáveis na fase, obrigatórios marcados,
// validação no navegador e erro do core mostrado no modal. Nunca cria card vazio.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { criarCardComCamposAction } from "@/app/w/[ws]/actions";
import { CampoInput } from "@/components/card/campo-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { nomeInput } from "@/lib/form-campos";
import { cn } from "@/lib/utils";

export interface CampoNovoCard {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  helpText: string | null;
  obrigatorio: boolean;
}

export interface FaseNovoCard {
  id: string | null;
  nome: string;
  campos: CampoNovoCard[];
}

/** Valor preenchido de um campo no FormData (checkbox desmarcado não conta). */
export function preenchido(form: FormData, c: { id: string; type: string }): boolean {
  const vs = form.getAll(nomeInput(c.id)).map((v) => String(v).trim());
  if (c.type === "boolean") return vs.includes("on");
  return vs.some((v) => v !== "");
}

export function NovoCard({
  ws,
  board,
  fase,
  aberto,
  onOpenChange,
  pessoas,
}: {
  ws: string;
  board: string;
  fase: FaseNovoCard | null;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  pessoas: Record<string, string>;
}) {
  const router = useRouter();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function validar(form: FormData): boolean {
    if (!fase) return false;
    const e: Record<string, string> = {};
    for (const c of fase.campos) if (c.obrigatorio && !preenchido(form, c)) e[c.id] = "Obrigatório nesta fase";
    setErros(e);
    if (Object.keys(e).length) {
      setErroGeral("Preencha os campos obrigatórios.");
      return false;
    }
    if (!fase.campos.some((c) => preenchido(form, c))) {
      setErroGeral("Preencha ao menos um campo para criar o card.");
      return false;
    }
    setErroGeral(null);
    return true;
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        onOpenChange(v);
        setErros({});
        setErroGeral(null);
      }}
    >
      <DialogContent className="max-w-2xl" aria-describedby="novo-card-desc">
        {fase && (
          <form
            noValidate
            className="flex min-h-0 flex-col"
            onSubmit={(e) => {
              const form = new FormData(e.currentTarget);
              e.preventDefault();
              if (!validar(form)) return;
              iniciar(async () => {
                const r = await criarCardComCamposAction(ws, board, fase.id, form);
                if (r.ok) {
                  onOpenChange(false);
                  router.push(`/w/${ws}/b/${board}/c/${r.id}`);
                } else {
                  setErroGeral(r.motivo);
                  setErros(Object.fromEntries((r.campos ?? []).map((id) => [id, "Verifique este campo"])));
                }
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Novo card</DialogTitle>
              <DialogDescription id="novo-card-desc">
                {fase.id ? `Fase: ${fase.nome}. ` : ""}Campos com * são obrigatórios.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="grid grid-cols-2 gap-x-5 gap-y-4">
              {fase.campos.map((c) => (
                <input key={`h-${c.id}`} type="hidden" name="campos" value={c.id} />
              ))}
              {fase.campos.length === 0 && (
                <p className="col-span-2 text-sm text-muted-foreground">Nenhum campo editável nesta fase. Configure os campos do board.</p>
              )}
              {fase.campos.map((c) => {
                const id = `novo-${c.id}`;
                return (
                  <div key={c.id} className={cn("flex flex-col gap-1.5", c.type === "long_text" && "col-span-2")} data-campo-novo={c.name}>
                    <Label htmlFor={id}>
                      {c.name}
                      {c.obrigatorio && (
                        <span className="ml-0.5 text-destructive" aria-hidden>
                          *
                        </span>
                      )}
                    </Label>
                    <CampoInput campo={c} valor={null} pessoas={pessoas} id={id} obrigatorio={c.obrigatorio} />
                    {erros[c.id] ? (
                      <p className="text-xs text-destructive" role="alert">
                        {erros[c.id]}
                      </p>
                    ) : (
                      c.helpText && <p className="text-xs text-muted-foreground">{c.helpText}</p>
                    )}
                  </div>
                );
              })}
              {erroGeral && (
                <p role="alert" className="col-span-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {erroGeral}
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendente || fase.campos.length === 0}>
                {pendente ? "Criando…" : "Criar card"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
