"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { criarBoardAction } from "@/app/w/[ws]/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TIPOS = [
  { valor: "workflow", titulo: "Fluxo", texto: "Cards passam por fases (kanban). Ex.: contratos, compras, chamados." },
  { valor: "database", titulo: "Base", texto: "Cadastro sem fases, em tabela. Ex.: parceiros, centros de custo." },
] as const;

/** Botão que abre o modal de novo board. `variante="bloco"` desenha um cartão da grade da home. */
export function NovoBoard({ ws, variante = "botao" }: { ws: string; variante?: "botao" | "bloco" }) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<"workflow" | "database">("workflow");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        setErro(null);
      }}
    >
      <DialogTrigger asChild>
        {variante === "bloco" ? (
          <button
            type="button"
            className="flex h-full min-h-28 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            <Plus className="size-5" /> Novo board
          </button>
        ) : (
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
            <Plus /> Novo board
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex min-h-0 flex-col"
          action={(form) =>
            iniciar(async () => {
              form.set("kind", tipo);
              const r = await criarBoardAction(ws, form);
              if (r && !r.ok) setErro(r.motivo);
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Novo board</DialogTitle>
            <DialogDescription>Você pode mudar fases e campos depois, em Configurações.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="novo-board-nome">Nome</Label>
              <Input id="novo-board-nome" name="nome" required autoFocus placeholder="Ex.: Contratos" />
            </div>
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="mb-1.5 text-sm font-medium">Tipo</legend>
              {TIPOS.map((t) => (
                <label
                  key={t.valor}
                  className={cn("cursor-pointer rounded-md border p-3 text-sm", tipo === t.valor ? "border-primary ring-1 ring-primary" : "hover:border-primary/40")}
                >
                  <input type="radio" name="kind-ui" value={t.valor} checked={tipo === t.valor} onChange={() => setTipo(t.valor)} className="sr-only" />
                  <span className="font-medium">{t.titulo}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{t.texto}</span>
                </label>
              ))}
            </fieldset>
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="submit" disabled={pendente}>
              {pendente ? "Criando…" : "Criar board"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
