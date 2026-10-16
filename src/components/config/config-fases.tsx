"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, ArrowDown, ArrowUp, Plus } from "lucide-react";
import { toast } from "sonner";
import { arquivarFaseAction, atualizarFaseAction, criarFaseAction, moverFaseAction, type ResultadoConfig } from "@/app/w/[ws]/b/[board]/settings/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
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

export interface FaseConfig {
  id: string;
  name: string;
  isTerminal: boolean;
  color: string | null;
  allowCreate: boolean;
  sla: unknown;
  descricao: string | null;
}

export function ConfigFases({ ws, board, fases, aberta }: { ws: string; board: string; fases: FaseConfig[]; /** Fase com as opções abertas (?fase= vindo do kanban). */ aberta?: string }) {
  const { pendente, executar } = useAcaoConfig();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fases</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ol className="flex flex-col gap-2">
          {fases.map((f, i) => (
            <li key={f.id} className="flex flex-col gap-2 border-b border-line-2 pb-2 last:border-b-0" data-config-fase={f.name}>
              <div className="flex items-center gap-2">
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
              </div>
              <details className="ml-8" open={aberta === f.id}>
                <summary className="cursor-pointer text-xs text-ink-2 hover:text-ink">Opções avançadas</summary>
                <OpcoesAvancadasFase ws={ws} board={board} fase={f} primeira={i === 0} />
              </details>
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

/** Descrição (fase vazia e topo do formulário), criação direta na fase e SLA. */
export function OpcoesAvancadasFase({ ws, board, fase, primeira }: { ws: string; board: string; fase: FaseConfig; primeira: boolean }) {
  const { pendente, executar } = useAcaoConfig();
  const sla = (fase.sla ?? null) as { duration?: number; unit?: string } | null;
  const [descricao, setDescricao] = useState(fase.descricao ?? "");
  const [permite, setPermite] = useState(fase.allowCreate);
  const [duracao, setDuracao] = useState(sla?.duration ? String(sla.duration) : "");
  const [unidade, setUnidade] = useState<"minutes" | "hours" | "days">((["minutes", "hours", "days"].includes(String(sla?.unit)) ? sla?.unit : "days") as "days");
  const salvar = () =>
    executar(
      () =>
        atualizarFaseAction(ws, board, fase.id, {
          descricao,
          permiteCriar: permite,
          sla: duracao.trim() ? { duration: Number(duracao), unit: unidade } : null,
        }),
      "Fase atualizada",
    );
  return (
    <div className="mt-2 grid max-w-2xl gap-3" data-opcoes-fase={fase.name}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`desc-${fase.id}`}>Descrição da fase</Label>
        <textarea
          id={`desc-${fase.id}`}
          rows={2}
          maxLength={500}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Aparece na fase vazia e no topo do formulário da fase."
          className="rounded border border-line bg-paper px-3 py-2 text-[13.5px] outline-none focus:border-accent"
        />
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" className="size-4" checked={primeira || permite} disabled={primeira} onChange={(e) => setPermite(e.target.checked)} />
        Permitir criar cartão direto nesta fase{primeira && " (a primeira fase sempre permite)"}
      </label>
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`sla-${fase.id}`}>SLA da fase</Label>
          <Input id={`sla-${fase.id}`} type="number" min={1} max={10000} className="w-28" value={duracao} onChange={(e) => setDuracao(e.target.value)} placeholder="sem SLA" />
        </div>
        <NativeSelect aria-label="Unidade do SLA" className="w-32" value={unidade} onChange={(e) => setUnidade(e.target.value as typeof unidade)}>
          <option value="minutes">minutos</option>
          <option value="hours">horas</option>
          <option value="days">dias</option>
        </NativeSelect>
        <Button size="sm" variant="outline" disabled={pendente} onClick={salvar} className="ml-auto">
          Salvar opções
        </Button>
      </div>
    </div>
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
          style={{ backgroundColor: corDaFase(cor, 0) }}
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
