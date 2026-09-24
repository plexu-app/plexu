"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Archive, ArrowDown, ArrowUp, Plus } from "lucide-react";
import { toast } from "sonner";
import { arquivarFaseAction, atualizarFaseAction, criarFaseAction, moverFaseAction, type ResultadoConfig } from "@/app/w/[ws]/b/[board]/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { corDaFase, PALETA_FASES } from "@/components/kanban-dados";
import { cn } from "@/lib/utils";

export function useAcaoConfig() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const executar = (fn: () => Promise<ResultadoConfig>, sucesso?: string, depois?: () => void, falhou?: () => void) =>
    iniciar(async () => {
      const r = await fn();
      if (r.ok) {
        if (sucesso) toast.success(sucesso);
        depois?.();
        router.refresh();
      } else {
        falhou?.();
        toast.error("Não foi possível salvar", { description: r.motivo });
      }
    });
  return { pendente, executar };
}

export function ConfigFases({ ws, board, fases }: { ws: string; board: string; fases: { id: string; name: string; isTerminal: boolean; color: string | null }[] }) {
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
              <CoresFase atual={f.color} indice={i} nome={f.name} desabilitado={pendente} escolher={(cor) => executar(() => atualizarFaseAction(ws, board, f.id, { cor }))} />
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

/** Paleta de cores da fase; "automática" usa a cor pela posição. */
function CoresFase({
  atual,
  indice,
  nome,
  desabilitado,
  escolher,
}: {
  atual: string | null;
  indice: number;
  nome: string;
  desabilitado: boolean;
  escolher: (cor: string | null) => void;
}) {
  const efetiva = corDaFase(atual, indice);
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={`Cor da fase ${nome}`}>
      {PALETA_FASES.map((cor) => (
        <button
          key={cor}
          type="button"
          role="radio"
          aria-checked={atual === cor}
          aria-label={`Cor ${cor}`}
          disabled={desabilitado}
          onClick={() => escolher(cor)}
          className={cn("size-4 rounded-full ring-offset-1", atual === cor && "ring-2 ring-foreground/60")}
          style={{ backgroundColor: cor }}
        />
      ))}
      <button
        type="button"
        role="radio"
        aria-checked={atual === null}
        disabled={desabilitado}
        onClick={() => escolher(null)}
        className={cn("ml-1 rounded px-1 text-xs text-muted-foreground hover:bg-muted", atual === null && "font-medium text-foreground")}
        title={`Automática (${efetiva})`}
      >
        auto
      </button>
    </div>
  );
}
