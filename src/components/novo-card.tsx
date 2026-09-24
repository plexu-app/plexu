"use client";
// Criar card = formulário da fase. Só campos visíveis na fase; visible_expr e required_expr
// avaliados ao vivo conforme o usuário preenche (mesmo motor do servidor). O servidor revalida e o
// core recusa obrigatório vazio. Nunca cria card vazio.
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { criarCardComCamposAction, type ResultadoCriacao } from "@/app/w/[ws]/actions";
import { CampoInput } from "@/components/card/campo-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { estadoCriacao, registroDoForm, valoresDoFormData, type CampoCriacaoDef } from "@/lib/campos-criacao";
import { cn } from "@/lib/utils";

export interface FaseNovoCard {
  id: string | null;
  nome: string;
  campos: CampoCriacaoDef[];
}

const preenchido = (valores: Record<string, string[]>, c: { id: string; type: string }) => {
  const vs = (valores[c.id] ?? []).map((v) => v.trim());
  return c.type === "boolean" ? vs.includes("on") : vs.some((v) => v !== "");
};

export function NovoCard({
  ws,
  board,
  fase,
  aberto,
  onOpenChange,
  pessoas,
  hoje,
  titulo = "Novo card",
  descricao,
  enviar,
  aoCriar,
}: {
  ws: string;
  board: string;
  fase: FaseNovoCard | null;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  pessoas: Record<string, string>;
  hoje: string;
  titulo?: string;
  descricao?: string;
  /** Envio alternativo (ex.: criar filho já vinculado ao pai). Padrão: cria no board e abre o card. */
  enviar?: (form: FormData) => Promise<ResultadoCriacao>;
  aoCriar?: (id: string) => void;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, string[]>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const campos = useMemo(() => fase?.campos ?? [], [fase]);
  const estados = useMemo(() => estadoCriacao(campos, registroDoForm(campos, valores), fase?.id ? fase.nome : null, hoje), [campos, valores, fase, hoje]);
  const visiveis = campos.filter((c) => estados[c.id]?.visivel);

  function reiniciar() {
    setValores({});
    setErros({});
    setErroGeral(null);
  }

  function validar(atuais: Record<string, string[]>): boolean {
    const est = estadoCriacao(campos, registroDoForm(campos, atuais), fase?.id ? fase.nome : null, hoje);
    const vis = campos.filter((c) => est[c.id]?.visivel);
    const e: Record<string, string> = {};
    for (const c of vis) if (est[c.id]?.obrigatorio && !preenchido(atuais, c)) e[c.id] = "Obrigatório nesta fase";
    setErros(e);
    if (Object.keys(e).length) {
      setErroGeral("Preencha os campos obrigatórios.");
      return false;
    }
    if (!vis.some((c) => preenchido(atuais, c))) {
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
        reiniciar();
      }}
    >
      <DialogContent className="max-w-2xl" aria-describedby="novo-card-desc">
        {fase && (
          <form
            noValidate
            className="flex min-h-0 flex-col"
            onChange={(e) => setValores(valoresDoFormData(new FormData(e.currentTarget)))}
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const atuais = valoresDoFormData(form);
              setValores(atuais);
              if (!validar(atuais)) return;
              iniciar(async () => {
                const r = enviar ? await enviar(form) : await criarCardComCamposAction(ws, board, fase.id, form);
                if (r.ok) {
                  onOpenChange(false);
                  reiniciar();
                  if (aoCriar) aoCriar(r.id);
                  else router.push(`/w/${ws}/b/${board}/c/${r.id}`);
                } else {
                  setErroGeral(r.motivo);
                  setErros(Object.fromEntries((r.campos ?? []).map((id) => [id, "Verifique este campo"])));
                }
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>{titulo}</DialogTitle>
              <DialogDescription id="novo-card-desc">
                {descricao ?? (fase.id ? `Fase: ${fase.nome}. ` : "")}Campos com * são obrigatórios.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="grid grid-cols-2 gap-x-5 gap-y-4">
              {visiveis.map((c) => (
                <input key={`h-${c.id}`} type="hidden" name="campos" value={c.id} />
              ))}
              {visiveis.length === 0 && <p className="col-span-2 text-sm text-muted-foreground">Nenhum campo editável nesta fase. Configure os campos do board.</p>}
              {visiveis.map((c) => {
                const id = `novo-${c.id}`;
                const obrigatorio = !!estados[c.id]?.obrigatorio;
                return (
                  <div key={c.id} className={cn("flex flex-col gap-1.5", c.type === "long_text" && "col-span-2")} data-campo-novo={c.name}>
                    <Label htmlFor={id}>
                      {c.name}
                      {obrigatorio && (
                        <span className="ml-0.5 text-destructive" aria-hidden>
                          *
                        </span>
                      )}
                    </Label>
                    <CampoInput campo={c} valor={null} pessoas={pessoas} id={id} obrigatorio={obrigatorio} />
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
                <p role="alert" className="col-span-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-strong">
                  {erroGeral}
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendente || visiveis.length === 0}>
                {pendente ? "Criando…" : "Criar card"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
