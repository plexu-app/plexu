"use client";
// Execuções de automações e ações do board: filtro por origem e status, log e reexecução.
import { Fragment, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { reexecutarAction } from "@/app/w/[ws]/b/[board]/settings/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { BadgeStatus, LogExecucao, ROTULO_STATUS } from "./log-execucao";

export interface ExecucaoLinha {
  id: string;
  origem: "automacao" | "acao";
  nome: string;
  cardId: string | null;
  card: string | null;
  status: string;
  env: string;
  tentativa: number;
  erro: string | null;
  log: unknown[];
  quando: string;
  gatilho: string;
}

export function Execucoes({
  ws,
  board,
  linhas,
  origens,
}: {
  ws: string;
  board: string;
  linhas: ExecucaoLinha[];
  origens: { id: string; nome: string; tipo: "automacao" | "acao" }[];
}) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const [aberta, setAberta] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const filtro = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    if (k === "automacao") p.delete("acao");
    router.replace(`${caminho}?${p.toString()}`);
  };
  const valorOrigem = params.get("automacao") ? `automacao:${params.get("automacao")}` : params.get("acao") ? `acao:${params.get("acao")}` : "";
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Execuções</CardTitle>
        <div className="flex gap-2">
          <NativeSelect
            aria-label="Filtrar por automação ou ação"
            value={valorOrigem}
            onChange={(e) => {
              const [tipo, id] = e.target.value.split(":");
              const p = new URLSearchParams(params.toString());
              p.delete("automacao");
              p.delete("acao");
              if (id) p.set(tipo, id);
              router.replace(`${caminho}?${p.toString()}`);
            }}
            className="w-auto"
          >
            <option value="">todas</option>
            {origens.map((o) => (
              <option key={o.id} value={`${o.tipo}:${o.id}`}>
                {o.tipo === "acao" ? "Ação: " : ""}
                {o.nome}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Filtrar por status" value={params.get("status") ?? ""} onChange={(e) => filtro("status", e.target.value)} className="w-auto">
            <option value="">qualquer status</option>
            {Object.entries(ROTULO_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </div>
      </CardHeader>
      <CardContent>
        {!linhas.length && <p className="text-sm text-muted-foreground">Nenhuma execução com esses filtros.</p>}
        {linhas.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Quando</th>
                <th className="font-medium">Automação / ação</th>
                <th className="font-medium">Card</th>
                <th className="font-medium">Gatilho</th>
                <th className="font-medium">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <Fragment key={l.id}>
                  <tr className="cursor-pointer border-t hover:bg-muted/50" onClick={() => setAberta(aberta === l.id ? null : l.id)} data-execucao={l.id}>
                    <td className="py-1.5 whitespace-nowrap">{new Date(l.quando).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })}</td>
                    <td>{l.nome}</td>
                    <td>{l.cardId ? <a className="underline-offset-2 hover:underline" href={`/w/${ws}/b/${board}/c/${l.cardId}`} onClick={(e) => e.stopPropagation()}>{l.card || l.cardId.slice(0, 8)}</a> : "—"}</td>
                    <td className="text-muted-foreground">{l.gatilho}</td>
                    <td>
                      <BadgeStatus status={l.status} env={l.env} />
                      {l.tentativa > 1 && <span className="ml-1 text-xs text-muted-foreground">tentativa {l.tentativa}</span>}
                    </td>
                    <td className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Reexecutar"
                        disabled={pendente}
                        onClick={(e) => {
                          e.stopPropagation();
                          iniciar(async () => {
                            const r = await reexecutarAction(ws, board, l.id);
                            if (r.ok) {
                              toast.success(`Reexecutada: ${ROTULO_STATUS[r.execucao.status] ?? r.execucao.status}`);
                              router.refresh();
                            } else toast.error("Não foi possível reexecutar", { description: r.motivo });
                          });
                        }}
                      >
                        <RotateCcw /> Reexecutar
                      </Button>
                    </td>
                  </tr>
                  {aberta === l.id && (
                    <tr>
                      <td colSpan={6} className="pb-3">
                        {l.erro && <p className="mb-1 text-sm text-destructive">{l.erro}</p>}
                        <LogExecucao log={l.log} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
