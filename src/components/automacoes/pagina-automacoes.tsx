"use client";
// Automações do board (prompt PR 2, C2). Lista em cards largos (até 1100px): nome, ligar/desligar e ⋯;
// grade de 4 colunas com Evento, Ação, Atualizado em e Atualizado por. Contador, busca, filtros (evento,
// ação, status), ordenação e alternância card/linha. Editor: título editável e "Ver logs"; dois painéis
// lado a lado ligados por um conector — Evento (com "e também siga estas condições") → Ação (passos
// numerados) — e "Salvar automação" na largura toda, abaixo da ação.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, CalendarClock, Ellipsis, FlaskConical, Layers, List, Plus, Rows3, ScrollText, Search, Trash, Zap } from "lucide-react";
import { arquivarAutomacaoAction, ativarAutomacaoAction, salvarAutomacaoAction } from "@/app/w/[ws]/b/[board]/settings/actions";
import { ConstrutorCondicoes } from "@/components/condicoes/construtor";
import { useAcaoConfig } from "@/components/config/config-fases";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { itemMenu, Menu } from "@/components/ui/menu";
import { TIPOS_GATILHO, TIPOS_PASSO } from "@/lib/automacoes";
import { formatarDataHora } from "@/lib/formatar";
import { cn } from "@/lib/utils";
import { EditorGatilho, resumoGatilho, ROTULO_AMBIENTE, TestarComCard, type AutomacaoUI } from "./config-automacoes";
import type { ContextoAutomacoes } from "./contexto";
import { EditorPassos, type PassoUI } from "./editor-passos";
import { BadgeStatus } from "./log-execucao";

const rotuloPasso = (t: unknown) => TIPOS_PASSO.find((p) => p.tipo === t)?.rotulo ?? String(t);
const resumoPassos = (steps: Record<string, unknown>[]) =>
  steps.length ? `${rotuloPasso(steps[0].type)}${steps.length > 1 ? ` + ${steps.length - 1} passo(s)` : ""}` : "Nenhuma ação";

type Status = "" | "ativa" | "desligada" | "draft" | "test" | "published";

export function PaginaAutomacoes({ ctx, automacoes, editar }: { ctx: ContextoAutomacoes; automacoes: AutomacaoUI[]; editar: string | null }) {
  const router = useRouter();
  const base = `/w/${ctx.ws}/b/${ctx.board}/automacoes`;
  const [busca, setBusca] = useState("");
  const [evento, setEvento] = useState("");
  const [acao, setAcao] = useState("");
  const [status, setStatus] = useState<Status>("");
  const [ordem, setOrdem] = useState<"atualizacao" | "nome">("atualizacao");
  const [compacto, setCompacto] = useState(false);
  const [testando, setTestando] = useState<AutomacaoUI | null>(null);
  const { pendente, executar } = useAcaoConfig();

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return automacoes
      .filter((a) => !t || a.nome.toLowerCase().includes(t))
      .filter((a) => !evento || a.trigger.type === evento)
      .filter((a) => !acao || a.steps.some((s) => s.type === acao))
      .filter((a) => !status || (status === "ativa" ? a.enabled : status === "desligada" ? !a.enabled : a.env === status))
      .sort((x, y) => (ordem === "nome" ? x.nome.localeCompare(y.nome, "pt-BR") : y.atualizadoEm.localeCompare(x.atualizadoEm)));
  }, [automacoes, busca, evento, acao, status, ordem]);

  if (editar !== null) {
    const atual = editar === "nova" ? null : (automacoes.find((a) => a.id === editar) ?? null);
    return <EditorAutomacao key={editar} ctx={ctx} atual={atual} voltar={() => router.push(base, { scroll: false })} logs={atual ? `${base}?aba=logs&automacao=${atual.id}` : null} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-6 py-6" data-lista-automacoes>
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-[13px] text-ink-2" data-contador-automacoes>
          Mostrando {lista.length} {lista.length === 1 ? "automação" : "automações"}
        </p>
        <label className="flex h-8 w-56 items-center gap-2 rounded border border-line bg-paper px-2.5 text-[13px] focus-within:border-accent">
          <Search className="size-3.5 text-ink-3" aria-hidden />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar automação" aria-label="Buscar automação" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <NativeSelect aria-label="Filtrar por evento" className="w-44" value={evento} onChange={(e) => setEvento(e.target.value)}>
          <option value="">todos os eventos</option>
          {TIPOS_GATILHO.map((t) => (
            <option key={t.tipo} value={t.tipo}>
              {t.rotulo}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Filtrar por ação" className="w-44" value={acao} onChange={(e) => setAcao(e.target.value)}>
          <option value="">todas as ações</option>
          {TIPOS_PASSO.map((t) => (
            <option key={t.tipo} value={t.tipo}>
              {t.rotulo}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Filtrar por status" className="w-36" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          <option value="">qualquer status</option>
          <option value="ativa">ligadas</option>
          <option value="desligada">desligadas</option>
          <option value="published">publicadas</option>
          <option value="test">em teste</option>
          <option value="draft">rascunhos</option>
        </NativeSelect>
        <NativeSelect aria-label="Ordenar" className="w-40" value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
          <option value="atualizacao">mais recentes</option>
          <option value="nome">nome (A–Z)</option>
        </NativeSelect>
        <div className="flex overflow-hidden rounded border border-line" role="group" aria-label="Exibição">
          <button type="button" aria-pressed={!compacto} onClick={() => setCompacto(false)} className={cn("grid size-8 place-items-center text-ink-3", !compacto && "bg-ink text-paper")} aria-label="Cards">
            <Rows3 className="size-4" />
          </button>
          <button type="button" aria-pressed={compacto} onClick={() => setCompacto(true)} className={cn("grid size-8 place-items-center text-ink-3", compacto && "bg-ink text-paper")} aria-label="Linhas">
            <List className="size-4" />
          </button>
        </div>
        <Button size="sm" onClick={() => router.push(`${base}?editar=nova`, { scroll: false })}>
          <Plus /> Nova automação
        </Button>
      </div>

      {!automacoes.length && (
        <p className="rounded border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">
          Nenhuma automação. Automações reagem a eventos do card (criação, fase, campos) ou a agendamentos e executam ações.
        </p>
      )}
      <ul className={cn("flex flex-col", compacto ? "divide-y divide-line-2 rounded border border-line bg-paper" : "gap-3")}>
        {lista.map((a) => {
          const opcoes = (
            <Menu
              rotulo={`Opções de ${a.nome}`}
              alinhar="end"
              gatilho={(p) => (
                <button type="button" {...p} className="grid size-8 place-items-center rounded text-ink-3 hover:bg-bg hover:text-ink" aria-label={`Mais opções de ${a.nome}`}>
                  <Ellipsis className="size-4" />
                </button>
              )}
            >
              <Link href={`${base}?editar=${a.id}`} className={itemMenu} scroll={false}>
                <Zap className="size-3.5" /> Editar
              </Link>
              <button type="button" className={itemMenu} onClick={() => setTestando(a)} aria-label={`Testar ${a.nome}`}>
                <FlaskConical className="size-3.5" /> Testar com card
              </button>
              <Link href={`${base}?aba=logs&automacao=${a.id}`} className={itemMenu}>
                <ScrollText className="size-3.5" /> Ver logs
              </Link>
              <button
                type="button"
                className={cn(itemMenu, "text-err hover:text-err")}
                disabled={pendente}
                aria-label={`Arquivar ${a.nome}`}
                onClick={() => confirm(`Arquivar a automação "${a.nome}"?`) && executar(() => arquivarAutomacaoAction(ctx.ws, ctx.board, a.id), "Automação arquivada")}
              >
                <Trash className="size-3.5" /> Arquivar
              </button>
            </Menu>
          );
          const alternar = (
            <label className="relative inline-flex cursor-pointer items-center" title={a.enabled ? "Ligada" : "Desligada"}>
              <input
                type="checkbox"
                role="switch"
                className="peer sr-only"
                checked={a.enabled}
                disabled={pendente}
                aria-label={`Ligar ${a.nome}`}
                onChange={(e) => executar(() => ativarAutomacaoAction(ctx.ws, ctx.board, a.id, e.target.checked))}
              />
              <span className="h-5 w-9 rounded-full border border-line bg-bg transition-colors peer-checked:border-accent peer-checked:bg-accent" />
              <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-paper transition-transform peer-checked:translate-x-4" />
            </label>
          );
          const cabeca = (
            <div className="flex min-w-0 items-center gap-2">
              <Link href={`${base}?editar=${a.id}`} className="truncate text-sm font-semibold hover:underline" scroll={false}>
                {a.nome}
              </Link>
              <span className="rounded border border-line px-1.5 py-px font-mono text-[10px] uppercase text-ink-3" data-ambiente={a.env}>
                {ROTULO_AMBIENTE[a.env]}
              </span>
              <span className="text-xs text-ink-3" data-ultima-execucao>
                {a.ultima ? <BadgeStatus status={a.ultima.status} /> : "nunca rodou"}
              </span>
            </div>
          );
          if (compacto)
            return (
              <li key={a.id} className={cn("flex items-center gap-4 px-4 py-2.5", !a.enabled && "opacity-60")} data-automacao={a.nome}>
                <div className="w-1/3 min-w-0">{cabeca}</div>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
                  {resumoGatilho(a.trigger, ctx)} → {resumoPassos(a.steps)}
                </span>
                {alternar}
                {opcoes}
              </li>
            );
          return (
            <li key={a.id} className={cn("rounded border border-line bg-paper p-4", !a.enabled && "opacity-70")} data-automacao={a.nome}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">{cabeca}</div>
                {alternar}
                {opcoes}
              </div>
              <dl className="mt-3 grid grid-cols-4 gap-4 border-t border-line-2 pt-3 text-[13px]">
                <div className="min-w-0">
                  <dt className="rotulo mb-1">Evento</dt>
                  <dd className="flex items-start gap-1.5">
                    <Zap className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                    <span className="line-clamp-2">{resumoGatilho(a.trigger, ctx)}</span>
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="rotulo mb-1">Ação</dt>
                  <dd className="flex items-start gap-1.5">
                    <Layers className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                    <span className="line-clamp-2">{resumoPassos(a.steps)}</span>
                  </dd>
                </div>
                <div>
                  <dt className="rotulo mb-1">Atualizado em</dt>
                  <dd className="flex items-center gap-1.5 font-mono text-xs text-ink-2">
                    <CalendarClock className="size-3.5 text-ink-3" aria-hidden />
                    {formatarDataHora(a.atualizadoEm)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="rotulo mb-1">Atualizado por</dt>
                  <dd className="truncate text-ink-2">{a.atualizadoPor ?? "—"}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
      <Dialog open={testando !== null} onOpenChange={(v) => !v && setTestando(null)}>
        <DialogContent className="max-w-2xl">{testando && <TestarComCard key={testando.id} ctx={ctx} automacao={testando} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function EditorAutomacao({ ctx, atual, voltar, logs }: { ctx: ContextoAutomacoes; atual: AutomacaoUI | null; voltar: () => void; logs: string | null }) {
  const { pendente, executar } = useAcaoConfig();
  const [nome, setNome] = useState(atual?.nome ?? "");
  const [gatilho, setGatilho] = useState<Record<string, unknown>>(atual?.trigger ?? { type: "card_created" });
  const [condicao, setCondicao] = useState(atual?.condicao ?? "");
  const [comCondicao, setComCondicao] = useState(!!atual?.condicao);
  const [passos, setPassos] = useState<PassoUI[]>((atual?.steps as PassoUI[]) ?? []);
  const [env, setEnv] = useState<AutomacaoUI["env"]>(atual?.env ?? "draft");
  const [suppress, setSuppress] = useState(atual?.suppress ?? false);
  const transicao = gatilho.type === "card_entered_phase" || gatilho.type === "card_left_phase";
  const condicoes = ctx.condicoes.filter((c) => transicao || (c.caminho !== "fase_origem" && c.caminho !== "fase_destino"));
  return (
    <form
      className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-6 py-6"
      aria-label={atual ? "Editar automação" : "Nova automação"}
      data-editor-automacao
      onSubmit={(e) => {
        e.preventDefault();
        executar(
          () => salvarAutomacaoAction(ctx.ws, ctx.board, atual?.id ?? null, { nome, trigger: gatilho, condicao: comCondicao ? condicao : "", steps: passos, env, suppress }),
          atual ? "Automação salva" : "Automação criada",
          voltar,
        );
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Nome da automação"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome da automação"
          className="h-10 min-w-0 flex-1 border-transparent bg-transparent px-1 text-xl font-semibold tracking-[-0.02em] hover:border-line focus:border-accent"
          required
        />
        {logs && (
          <Link href={logs} className="inline-flex h-8 items-center gap-1.5 rounded border border-line px-2.5 text-[13px] text-ink-2 hover:bg-bg hover:text-ink">
            <ScrollText className="size-3.5" /> Ver logs
          </Link>
        )}
        <Label htmlFor="auto-env" className="sr-only">
          Ambiente
        </Label>
        <NativeSelect id="auto-env" aria-label="Ambiente" className="w-52" value={env} onChange={(e) => setEnv(e.target.value as AutomacaoUI["env"])}>
          <option value="draft">Rascunho (não dispara)</option>
          <option value="test">Teste (simula e registra)</option>
          <option value="published">Publicada</option>
        </NativeSelect>
        <Button type="button" variant="ghost" size="sm" onClick={voltar}>
          Voltar
        </Button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] items-start max-[900px]:grid-cols-1">
        <section aria-label="Evento" className="flex flex-col gap-3 rounded border border-line bg-paper p-4" data-painel="evento">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Zap className="size-4 text-accent" aria-hidden /> Evento
          </h3>
          <EditorGatilho ctx={ctx} g={gatilho} set={setGatilho} />
          {comCondicao ? (
            <div className="flex flex-col gap-2 border-t border-line-2 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium">e também siga estas condições</span>
                <button
                  type="button"
                  className="text-xs text-ink-3 hover:text-err"
                  onClick={() => {
                    setComCondicao(false);
                    setCondicao("");
                  }}
                >
                  remover condições
                </button>
              </div>
              <ConstrutorCondicoes key={String(gatilho.type)} rotulo="Condição da automação" valor={condicao} onChange={setCondicao} campos={condicoes} />
            </div>
          ) : (
            <button type="button" className="self-start text-[13px] text-accent hover:underline" onClick={() => setComCondicao(true)}>
              + adicionar condição
            </button>
          )}
          <label className="flex items-center gap-2 border-t border-line-2 pt-3 text-xs text-ink-2">
            <input type="checkbox" className="size-4" checked={suppress} onChange={(e) => setSuppress(e.target.checked)} />
            Não disparar outras automações com o que esta alterar
          </label>
        </section>
        <div className="flex h-24 items-center justify-center max-[900px]:h-8" aria-hidden data-conector>
          <span className="h-px flex-1 bg-line" />
          <ArrowRight className="size-4 text-ink-3" />
        </div>
        <div className="flex flex-col gap-3">
          <section aria-label="Ação" className="flex flex-col gap-3 rounded border border-line bg-paper p-4" data-painel="acao">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="size-4 text-accent" aria-hidden /> Ação
            </h3>
            <EditorPassos ctx={ctx} passos={passos} onChange={setPassos} />
          </section>
          <Button type="submit" className="h-10 w-full" disabled={pendente}>
            Salvar automação
          </Button>
        </div>
      </div>
    </form>
  );
}
