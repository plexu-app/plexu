"use client";
// Botões de ação no card: com mini-form, abre um diálogo; executa na hora e mostra o resultado.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { executarAcaoAction } from "@/app/w/[ws]/actions";
import { LogExecucao } from "@/components/automacoes/log-execucao";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";

export interface AcaoCardUI {
  id: string;
  nome: string;
  form: { key: string; label: string; type: "text" | "number" | "date" | "boolean"; required?: boolean }[];
}

export function AcoesCard({ ws, board, cardId, acoes }: { ws: string; board: string; cardId: string; acoes: AcaoCardUI[] }) {
  const router = useRouter();
  const [aberta, setAberta] = useState<AcaoCardUI | null>(null);
  const [falha, setFalha] = useState<{ erro: string | null; log: unknown[] } | null>(null);
  const [pendente, iniciar] = useTransition();
  if (!acoes.length) return null;

  const rodar = (a: AcaoCardUI, form: Record<string, unknown>) =>
    iniciar(async () => {
      const r = await executarAcaoAction(ws, board, cardId, a.id, form);
      if (!r.ok) {
        toast.error(`Não foi possível executar "${a.nome}"`, { description: r.motivo });
        return;
      }
      if (r.status === "success") {
        toast.success(`${a.nome}: feito`);
        setAberta(null);
        setFalha(null);
      } else {
        setAberta(a);
        setFalha({ erro: r.erro, log: r.log });
      }
      router.refresh();
    });

  return (
    <section aria-label="Ações" className="flex flex-col gap-1.5" data-acoes-card>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ações</h3>
      {acoes.map((a) => (
        <Button
          key={a.id}
          variant="outline"
          size="sm"
          className="justify-start"
          disabled={pendente}
          onClick={() => {
            setFalha(null);
            if (a.form.length) setAberta(a);
            else rodar(a, {});
          }}
        >
          <Zap /> {a.nome}
        </Button>
      ))}
      <Dialog open={aberta !== null} onOpenChange={(v) => !v && (setAberta(null), setFalha(null))}>
        <DialogContent className="max-w-lg">
          {aberta && (
            <form
              className="flex min-h-0 flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                const dados = new FormData(e.currentTarget);
                rodar(aberta, Object.fromEntries(aberta.form.map((c) => [c.key, c.type === "boolean" ? dados.get(c.key) === "on" : dados.get(c.key)])));
              }}
            >
              <DialogHeader>
                <DialogTitle>{aberta.nome}</DialogTitle>
                {aberta.form.length > 0 && <DialogDescription>Preencha para executar.</DialogDescription>}
              </DialogHeader>
              <DialogBody className="flex flex-col gap-3">
                {aberta.form.map((c) =>
                  c.type === "boolean" ? (
                    <label key={c.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name={c.key} className="size-4" /> {c.label}
                    </label>
                  ) : (
                    <div key={c.key} className="flex flex-col gap-1.5">
                      <Label htmlFor={`acao-${c.key}`}>
                        {c.label}
                        {c.required && <span className="text-destructive"> *</span>}
                      </Label>
                      <Input id={`acao-${c.key}`} name={c.key} type={c.type === "date" ? "date" : "text"} inputMode={c.type === "number" ? "decimal" : undefined} required={c.required} />
                    </div>
                  ),
                )}
                {falha && (
                  <div className="flex flex-col gap-1" data-falha-acao>
                    <p className="text-sm text-destructive">{falha.erro ?? "A ação não foi concluída."}</p>
                    <LogExecucao log={falha.log} />
                  </div>
                )}
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setAberta(null)}>
                  Fechar
                </Button>
                <Button type="submit" disabled={pendente}>
                  Executar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
