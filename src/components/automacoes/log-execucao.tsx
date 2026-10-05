"use client";
// Log de uma execução: um item por passo (e condição/simulação), com detalhe expansível.
import { Badge } from "@/components/ui/misc";
import { TIPOS_PASSO } from "@/lib/automacoes";
import { cn } from "@/lib/utils";

interface Item {
  passo: number | null;
  tipo: string;
  status: string;
  mensagem?: string;
  detalhe?: unknown;
  ms?: number;
}

const ROTULO = new Map<string, string>([...TIPOS_PASSO.map((t) => [t.tipo, t.rotulo] as [string, string]), ["condicao", "Condição"], ["simulacao", "Simulação"], ["info", "Aviso"], ["erro", "Erro"]]);
const COR: Record<string, string> = { ok: "text-ok", erro: "text-destructive", simulado: "text-warn", nao_enviado: "text-warn", info: "text-muted-foreground" };
const STATUS_ITEM: Record<string, string> = { ok: "ok", erro: "erro", simulado: "simulado", nao_enviado: "não enviado", info: "" };

export const ROTULO_STATUS: Record<string, string> = {
  queued: "na fila",
  running: "rodando",
  success: "sucesso",
  failed: "falhou",
  skipped: "pulada",
  dead: "esgotou tentativas",
};

export function BadgeStatus({ status, env }: { status: string; env?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={status === "success" ? "default" : status === "failed" || status === "dead" ? "destructive" : "outline"} data-status={status}>
        {ROTULO_STATUS[status] ?? status}
      </Badge>
      {env === "test" && <Badge variant="outline">teste</Badge>}
    </span>
  );
}

export function LogExecucao({ log, erro }: { log: unknown[]; erro?: string | null }) {
  const itens = (Array.isArray(log) ? log : []) as Item[];
  return (
    <div className="flex flex-col gap-1 text-sm" data-log-execucao>
      {!itens.length && erro && <p className="text-destructive">{erro}</p>}
      <ol className="flex flex-col gap-1">
        {itens.map((it, i) => (
          <li key={i} className="rounded-md border px-2 py-1.5" data-item-log={it.tipo} data-status-item={it.status}>
            <div className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-xs text-muted-foreground">{it.passo ?? "·"}</span>
              <span className="font-medium">{ROTULO.get(it.tipo) ?? it.tipo}</span>
              {STATUS_ITEM[it.status] && <span className={cn("text-xs font-medium", COR[it.status])}>{STATUS_ITEM[it.status]}</span>}
              {it.ms !== undefined && <span className="ml-auto text-xs text-muted-foreground">{it.ms} ms</span>}
            </div>
            {it.mensagem && <p className={cn("pl-8 text-xs", COR[it.status])}>{it.mensagem}</p>}
            {it.detalhe !== undefined && (
              <details className="pl-8">
                <summary className="cursor-pointer text-xs text-muted-foreground">detalhe</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(it.detalhe, null, 2)}</pre>
              </details>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
