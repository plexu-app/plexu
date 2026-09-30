"use client";
// Settings → Automações: lista com ambiente e última execução; editor gatilho → condição → passos;
// "Testar com card" roda em modo teste (nada é gravado) e mostra o log.
import { useState, useTransition } from "react";
import Link from "next/link";
import { FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  arquivarAutomacaoAction,
  ativarAutomacaoAction,
  buscarCardsDoBoardAction,
  salvarAutomacaoAction,
  testarAutomacaoAction,
  type ExecucaoUI,
} from "@/app/w/[ws]/b/[board]/settings/actions";
import { ConstrutorCondicoes } from "@/components/condicoes/construtor";
import { useAcaoConfig } from "@/components/config/config-fases";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { TIPOS_GATILHO, type TipoGatilho } from "@/lib/automacoes";
import { cn } from "@/lib/utils";
import type { ContextoAutomacoes } from "./contexto";
import { EditorPassos, type PassoUI } from "./editor-passos";
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
}

export const ROTULO_AMBIENTE: Record<string, string> = { draft: "Rascunho", test: "Teste", published: "Publicada" };

function resumoGatilho(t: Record<string, unknown>, ctx: ContextoAutomacoes): string {
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

export function ConfigAutomacoes({ ctx, automacoes }: { ctx: ContextoAutomacoes; automacoes: AutomacaoUI[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [testando, setTestando] = useState<AutomacaoUI | null>(null);
  const { pendente, executar } = useAcaoConfig();
  const atual = editando && editando !== "nova" ? automacoes.find((a) => a.id === editando) ?? null : null;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Automações</CardTitle>
        <div className="flex items-center gap-2">
          <Link href={`/w/${ctx.ws}/b/${ctx.board}/settings?aba=execucoes`} className="text-sm text-muted-foreground hover:text-foreground">
            Execuções
          </Link>
          <Button size="sm" onClick={() => setEditando("nova")}>
            <Plus /> Nova automação
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!automacoes.length && <p className="text-sm text-muted-foreground">Nenhuma automação. Automações reagem a eventos do card (criação, fase, campos) ou a agendamentos e executam passos.</p>}
        <ul className="flex flex-col divide-y rounded-md border">
          {automacoes.map((a) => (
            <li key={a.id} className={cn("flex items-center gap-3 px-3 py-2", !a.enabled && "opacity-60")} data-automacao={a.nome}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{a.nome}</span>
                  <Badge variant={a.env === "published" ? "default" : "outline"} data-ambiente={a.env}>
                    {ROTULO_AMBIENTE[a.env]}
                  </Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {resumoGatilho(a.trigger, ctx)} · {a.steps.length} passo(s)
                  {a.condicao ? " · com condição" : ""}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground" data-ultima-execucao>
                {a.ultima ? (
                  <>
                    <BadgeStatus status={a.ultima.status} />
                    <div>{new Date(a.ultima.quando).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</div>
                  </>
                ) : (
                  "nunca rodou"
                )}
              </div>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" className="size-4" checked={a.enabled} disabled={pendente} onChange={(e) => executar(() => ativarAutomacaoAction(ctx.ws, ctx.board, a.id, e.target.checked))} />
                ativa
              </label>
              <Button variant="ghost" size="icon" aria-label={`Testar ${a.nome}`} title="Testar com card" onClick={() => setTestando(a)}>
                <FlaskConical />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Editar ${a.nome}`} onClick={() => setEditando(a.id)}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Arquivar ${a.nome}`}
                disabled={pendente}
                onClick={() => confirm(`Arquivar a automação "${a.nome}"?`) && executar(() => arquivarAutomacaoAction(ctx.ws, ctx.board, a.id), "Automação arquivada")}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
      <Dialog open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-w-4xl">{editando !== null && <EditorAutomacao key={editando} ctx={ctx} atual={atual} fechar={() => setEditando(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={testando !== null} onOpenChange={(v) => !v && setTestando(null)}>
        <DialogContent className="max-w-2xl">{testando && <TestarComCard key={testando.id} ctx={ctx} automacao={testando} />}</DialogContent>
      </Dialog>
    </Card>
  );
}

function gatilhoVazio(tipo: TipoGatilho): Record<string, unknown> {
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

function EditorAutomacao({ ctx, atual, fechar }: { ctx: ContextoAutomacoes; atual: AutomacaoUI | null; fechar: () => void }) {
  const { pendente, executar } = useAcaoConfig();
  const [nome, setNome] = useState(atual?.nome ?? "");
  const [gatilho, setGatilho] = useState<Record<string, unknown>>(atual?.trigger ?? { type: "card_created" });
  const [condicao, setCondicao] = useState(atual?.condicao ?? "");
  const [passos, setPassos] = useState<PassoUI[]>((atual?.steps as PassoUI[]) ?? []);
  const [env, setEnv] = useState<AutomacaoUI["env"]>(atual?.env ?? "draft");
  const [suppress, setSuppress] = useState(atual?.suppress ?? false);
  const transicao = gatilho.type === "card_entered_phase" || gatilho.type === "card_left_phase";
  const condicoes = ctx.condicoes.filter((c) => transicao || (c.caminho !== "fase_origem" && c.caminho !== "fase_destino"));
  return (
    <form
      className="flex min-h-0 flex-col"
      aria-label={atual ? "Editar automação" : "Nova automação"}
      action={() =>
        executar(
          () => salvarAutomacaoAction(ctx.ws, ctx.board, atual?.id ?? null, { nome, trigger: gatilho, condicao, steps: passos, env, suppress }),
          atual ? "Automação salva" : "Automação criada",
          fechar,
        )
      }
    >
      <DialogHeader>
        <DialogTitle>{atual ? `Editar automação: ${atual.nome}` : "Nova automação"}</DialogTitle>
        <DialogDescription>Quando o gatilho acontece e a condição é verdadeira, os passos rodam em ordem (param no primeiro erro).</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auto-nome">Nome</Label>
            <Input id="auto-nome" aria-label="Nome da automação" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Avisar financeiro quando o contrato for assinado" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auto-env">Ambiente</Label>
            <NativeSelect id="auto-env" aria-label="Ambiente" value={env} onChange={(e) => setEnv(e.target.value as AutomacaoUI["env"])}>
              <option value="draft">Rascunho (não dispara)</option>
              <option value="test">Teste (simula e registra)</option>
              <option value="published">Publicada</option>
            </NativeSelect>
          </div>
        </div>

        <section className="flex flex-col gap-2 rounded-md border p-3">
          <h3 className="text-sm font-semibold">1. Quando</h3>
          <EditorGatilho ctx={ctx} g={gatilho} set={setGatilho} />
        </section>

        <section className="flex flex-col gap-2 rounded-md border p-3">
          <h3 className="text-sm font-semibold">2. Se (opcional)</h3>
          <ConstrutorCondicoes key={String(gatilho.type)} rotulo="Condição da automação" valor={condicao} onChange={setCondicao} campos={condicoes} />
        </section>

        <section className="flex flex-col gap-2 rounded-md border p-3">
          <h3 className="text-sm font-semibold">3. Então</h3>
          <EditorPassos ctx={ctx} passos={passos} onChange={setPassos} />
        </section>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={suppress} onChange={(e) => setSuppress(e.target.checked)} />
          Não disparar outras automações com o que esta automação alterar
        </label>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={fechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendente}>
          Salvar automação
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditorGatilho({ ctx, g, set }: { ctx: ContextoAutomacoes; g: Record<string, unknown>; set: (g: Record<string, unknown>) => void }) {
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

function TestarComCard({ ctx, automacao }: { ctx: ContextoAutomacoes; automacao: AutomacaoUI }) {
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
