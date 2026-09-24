"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Archive, ArrowDown, ArrowUp, Plus } from "lucide-react";
import { toast } from "sonner";
import { arquivarFaseAction, atualizarFaseAction, criarFaseAction, moverFaseAction, type ResultadoConfig } from "@/app/w/[ws]/b/[board]/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";

export function useAcaoConfig() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const executar = (fn: () => Promise<ResultadoConfig>, sucesso?: string, depois?: () => void) =>
    iniciar(async () => {
      const r = await fn();
      if (r.ok) {
        if (sucesso) toast.success(sucesso);
        depois?.();
        router.refresh();
      } else toast.error("Não foi possível salvar", { description: r.motivo });
    });
  return { pendente, executar };
}

export function ConfigFases({ ws, board, fases }: { ws: string; board: string; fases: { id: string; name: string; isTerminal: boolean }[] }) {
  const { pendente, executar } = useAcaoConfig();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fases</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ol className="flex flex-col gap-2">
          {fases.map((f, i) => (
            <li key={f.id} className="flex items-center gap-2" data-config-fase={f.name}>
              <span className="w-6 text-right text-xs text-muted-foreground">{i + 1}</span>
              <form
                className="flex flex-1 items-center gap-2"
                action={(form) => executar(() => atualizarFaseAction(ws, board, f.id, { nome: String(form.get("nome") ?? "") }), "Fase renomeada")}
              >
                <Input name="nome" defaultValue={f.name} aria-label={`Nome da fase ${f.name}`} className="max-w-xs" />
                <Button type="submit" variant="outline" size="sm" disabled={pendente}>
                  Renomear
                </Button>
              </form>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={f.isTerminal}
                  disabled={pendente}
                  onChange={(e) => executar(() => atualizarFaseAction(ws, board, f.id, { terminal: e.target.checked }))}
                />
                final
              </label>
              <Button variant="ghost" size="icon" aria-label={`Subir ${f.name}`} disabled={pendente || i === 0} onClick={() => executar(() => moverFaseAction(ws, board, f.id, -1))}>
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Descer ${f.name}`}
                disabled={pendente || i === fases.length - 1}
                onClick={() => executar(() => moverFaseAction(ws, board, f.id, 1))}
              >
                <ArrowDown />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Arquivar ${f.name}`} disabled={pendente} onClick={() => executar(() => arquivarFaseAction(ws, board, f.id), "Fase arquivada")}>
                <Archive />
              </Button>
            </li>
          ))}
        </ol>
        <form
          className="flex items-center gap-2 border-t pt-3"
          action={(form) => executar(() => criarFaseAction(ws, board, String(form.get("nome") ?? "")), "Fase criada")}
        >
          <Input name="nome" placeholder="Nova fase" aria-label="Nome da nova fase" className="max-w-xs" required />
          <Button type="submit" size="sm" disabled={pendente}>
            <Plus /> Adicionar fase
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
