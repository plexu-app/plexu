"use client";
// Peças das automações usadas pela página do board (pagina-automacoes.tsx): resumo e editor do gatilho
// e "Testar com card", que roda em modo teste (nada é gravado) e mostra o log.
import { useState, useTransition } from "react";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { buscarCardsDoBoardAction, testarAutomacaoAction, type ExecucaoUI } from "@/app/w/[ws]/b/[board]/settings/actions";
import { Button } from "@/components/ui/button";
import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { TIPOS_GATILHO, type TipoGatilho } from "@/lib/automacoes";
import type { ContextoAutomacoes } from "./contexto";
import { BadgeStatus, LogExecucao } from "./log-execucao";

export interface AutomacaoUI {
  id: string;
  nome: string;
  trigger: Record<string, unknown>;
  condicao: string;
  steps: Record<string, unknown>[];
  env: "draft" | "test" | "published";
  suppress: boolean;
  enabled: boolean;
  ultima: { status: string; quando: string; erro: string | null } | null;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

export const ROTULO_AMBIENTE: Record<string, string> = { draft: "Rascunho", test: "Teste", published: "Publicada" };

export function resumoGatilho(t: Record<string, unknown>, ctx: ContextoAutomacoes): string {
  const fase = (id: unknown) => ctx.fases.find((f) => f.id === id)?.name ?? "?";
  const campo = (id: unknown) => ctx.campos.find((c) => c.id === id)?.name ?? "?";
  switch (t.type) {
    case "card_created":
      return "Quando um card é criado";
    case "card_entered_phase":
      return `Quando o card entra em ${fase(t.phase)}`;
    case "card_left_phase":
      return `Quando o card sai de ${fase(t.phase)}`;
    case "field_updated": {
      const fs = (t.fields as string[] | undefined) ?? [];
      return fs.length ? `Quando muda ${fs.map(campo).join(", ")}` : "Quando qualquer campo muda";
    }
    case "all_children_in_phase": {
      const rel = ctx.relacoes.find((r) => r.id === t.relation);
      const outro = ctx.boards.find((b) => b.id === rel?.outro);
      return `Quando todos os ${rel?.rotulo ?? "filhos"} estão em ${outro?.fases.find((f) => f.id === t.phase)?.name ?? "?"}`;
    }
    case "scheduled":
      if (t.cron) return `Recorrência: ${t.cron}`;
      return `${Math.abs(Number(t.offset_days ?? 0))} dia(s) ${Number(t.offset_days) < 0 ? "antes de" : Number(t.offset_days) > 0 ? "depois de" : "em"} ${campo(t.date_field)}, às ${t.time ?? "08:00"}`;
    default:
      return String(t.type);
  }
}

export function gatilhoVazio(tipo: TipoGatilho): Record<string, unknown> {
  switch (tipo) {
    case "card_entered_phase":
    case "card_left_phase":
      return { type: tipo, phase: "" };
    case "field_updated":
      return { type: tipo, fields: [] };
    case "all_children_in_phase":
      return { type: tipo, relation: "", phase: "" };
    case "scheduled":
      return { type: tipo, date_field: "", offset_days: 0, time: "08:00" };
    default:
      return { type: tipo };
  }
}

export function EditorGatilho({ ctx, g, set }: { ctx: ContextoAutomacoes; g: Record<string, unknown>; set: (g: Record<string, unknown>) => void }) {
  const upd = (k: string, v: unknown) => set({ ...g, [k]: v });
  const datas = ctx.campos.filter((c) => c.type === "date" || c.type === "datetime");
  const rel = ctx.relacoes.find((r) => r.id === g.relation);
  const filhos = ctx.boards.find((b) => b.id === rel?.outro);
  const recorrencia = g.type === "scheduled" && g.cron !== undefined;
  return (
    <div className="flex flex-col gap-2">
      <NativeSelect aria-label="Gatilho" value={String(g.type)} onChange={(e) => set(gatilhoVazio(e.target.value as TipoGatilho))}>
        {TIPOS_GATILHO.map((t) => (
          <option key={t.tipo} value={t.tipo}>
            {t.rotulo}
          </option>
        ))}
      </NativeSelect>
      {(g.type === "card_entered_phase" || g.type === "card_left_phase") && (
        <NativeSelect aria-label="Fase do gatilho" value={String(g.phase ?? "")} onChange={(e) => upd("phase", e.target.value)}>
          <option value="">— escolha a fase —</option>
          {ctx.fases.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </NativeSelect>
      )}
      {g.type === "field_updated" && (
        <fieldset className="grid grid-cols-3 gap-1" aria-label="Campos observados">
          <legend className="mb-1 text-xs text-muted-foreground">Campos (nenhum marcado = qualquer campo)</legend>
          {ctx.campos.map((c) => {
            const lista = (g.fields as string[]) ?? [];
            return (
              <label key={c.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="size-4" checked={lista.includes(c.id)} onChange={(e) => upd("fields", e.target.checked ? [...lista, c.id] : lista.filter((x) => x !== c.id))} />
                {c.name}
              </label>
            );
          })}
        </fieldset>
      )}
      {g.type === "all_children_in_phase" && (
        <div className="grid grid-cols-2 gap-2">
          <NativeSelect aria-label="Relação com os filhos" value={String(g.relation ?? "")} onChange={(e) => set({ ...g, relation: e.target.value, phase: "" })}>
            <option value="">— relação —</option>
            {ctx.relacoes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.rotulo}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Fase dos filhos" value={String(g.phase ?? "")} onChange={(e) => upd("phase", e.target.value)}>
            <option value="">— fase dos filhos —</option>
            {filhos?.fases.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      {g.type === "scheduled" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="agendamento" checked={!recorrencia} onChange={() => set({ type: "scheduled", date_field: "", offset_days: 0, time: "08:00" })} />
              Data do card
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="agendamento" checked={recorrencia} onChange={() => set({ type: "scheduled", cron: "0 8 * * 1-5" })} />
              Recorrência
            </label>
          </div>
          {recorrencia ? (
            <div className="flex flex-col gap-1">
              <Input aria-label="Recorrência (cron)" className="font-mono" value={String(g.cron ?? "")} onChange={(e) => upd("cron", e.target.value)} />
              <p className="text-xs text-muted-foreground">minuto hora dia mês dia-da-semana, no fuso do workspace. Ex.: 0 8 * * 1-5 (8h em dias úteis), 0 9 1 * * (dia 1, 9h). Sem card: use passos que não precisem de um.</p>
            </div>
          ) : (
            <div className="grid grid-cols-[6rem_9rem_1fr_7rem] items-center gap-2">
              <Input aria-label="Dias" type="number" min={0} value={Math.abs(Number(g.offset_days ?? 0))} onChange={(e) => upd("offset_days", Number(e.target.value) * (Number(g.offset_days) < 0 ? -1 : 1))} />
              <NativeSelect
                aria-label="Antes ou depois"
                value={Number(g.offset_days) < 0 ? "antes" : "depois"}
                onChange={(e) => upd("offset_days", Math.abs(Number(g.offset_days ?? 0)) * (e.target.value === "antes" ? -1 : 1))}
              >
                <option value="antes">dia(s) antes de</option>
                <option value="depois">dia(s) depois de</option>
              </NativeSelect>
              <NativeSelect aria-label="Campo de data" value={String(g.date_field ?? "")} onChange={(e) => upd("date_field", e.target.value)}>
                <option value="">— campo de data —</option>
                {datas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              <Input aria-label="Hora" type="time" value={String(g.time ?? "08:00")} onChange={(e) => upd("time", e.target.value)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TestarComCard({ ctx, automacao }: { ctx: ContextoAutomacoes; automacao: AutomacaoUI }) {
  const [termo, setTermo] = useState("");
  const [opcoes, setOpcoes] = useState<{ id: string; title: string }[]>([]);
  const [escolhido, setEscolhido] = useState<{ id: string; title: string } | null>(null);
  const [resultado, setResultado] = useState<ExecucaoUI | null>(null);
  const [pendente, iniciar] = useTransition();
  const buscar = (t: string) => {
    setTermo(t);
    iniciar(async () => setOpcoes(await buscarCardsDoBoardAction(ctx.ws, ctx.board, t)));
  };
  return (
    <div className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>Testar “{automacao.nome}”</DialogTitle>
        <DialogDescription>Roda em modo teste com o card escolhido: mostra o que aconteceria, sem gravar nada. E-mail e HTTP são simulados.</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="teste-card">Card</Label>
          <Input id="teste-card" aria-label="Buscar card para testar" value={termo} onChange={(e) => buscar(e.target.value)} onFocus={() => !opcoes.length && buscar(termo)} placeholder="título ou número do card" />
          {!escolhido && opcoes.length > 0 && (
            <ul className="max-h-40 overflow-auto rounded-md border" role="listbox" aria-label="Cards">
              {opcoes.map((o) => (
                <li key={o.id}>
                  <button type="button" role="option" aria-selected={false} className="w-full px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => setEscolhido(o)}>
                    {o.title || o.id.slice(0, 8)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {escolhido && (
            <p className="text-sm">
              Card: <strong data-card-teste>{escolhido.title || escolhido.id.slice(0, 8)}</strong>{" "}
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setEscolhido(null)}>
                trocar
              </button>
            </p>
          )}
        </div>
        {resultado && (
          <div className="flex flex-col gap-2" data-resultado-teste>
            <BadgeStatus status={resultado.status} env={resultado.env} />
            <LogExecucao log={resultado.log} erro={resultado.erro} />
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button
          disabled={!escolhido || pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await testarAutomacaoAction(ctx.ws, ctx.board, automacao.id, escolhido!.id);
              if (r.ok) setResultado(r.execucao);
              else toast.error("Não foi possível testar", { description: r.motivo });
            })
          }
        >
          <FlaskConical /> Rodar teste
        </Button>
      </DialogFooter>
    </div>
  );
}
