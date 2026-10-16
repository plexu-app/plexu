"use client";
// Casco do board (docs/design/prompt-redesign-pr2.md, A1): cabeçalho em três faixas.
//  1. Global (56px): ícone do board + nome (clique = informações); à direita ajuda e avatar.
//  2. Contexto (48px): Fluxo · Automações · Conexões ▾; à direita Configurar.
//  3. Visões (48px): abas Kanban · Lista; à direita busca (232px), filtro e recolher cabeçalho.
// Recolher esconde as faixas 2 e 3 (estado em localStorage, aplicado antes da pintura). Busca e filtros
// vão para a URL e o servidor filtra (kanban e lista paginam). O modal de criação é compartilhado com o
// "+" das fases e o botão flutuante via contexto.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, CircleHelp, Database, Funnel, LogOut, Search, Settings, Workflow } from "lucide-react";
import { sair } from "@/app/auth-actions";
import { NovoCard, type FaseNovoCard } from "@/components/novo-card";
import { iniciais } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Label, NativeSelect } from "@/components/ui/input";
import { itemMenu, Menu } from "@/components/ui/menu";
import { lerFiltros, temFiltro } from "@/lib/filtros";
import { cn } from "@/lib/utils";

const CtxNovoCard = createContext<(faseId: string | null) => void>(() => {});

/** Abre o modal de novo card numa fase (null = fase inicial). */
export const useNovoCard = () => useContext(CtxNovoCard);

const CHAVE_CABECALHO = "plexu:cabecalho";

/** Script inline no layout do board: aplica o cabeçalho recolhido antes da pintura. */
export const SCRIPT_CABECALHO = `try{if(localStorage.getItem("${CHAVE_CABECALHO}")==="recolhido")document.documentElement.dataset.cabecalho="recolhido"}catch(e){}`;

function alternarCabecalho() {
  const recolher = document.documentElement.dataset.cabecalho !== "recolhido";
  if (recolher) document.documentElement.dataset.cabecalho = "recolhido";
  else delete document.documentElement.dataset.cabecalho;
  try {
    localStorage.setItem(CHAVE_CABECALHO, recolher ? "recolhido" : "aberto");
  } catch {
    // sem armazenamento: vale só nesta página
  }
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export interface BoardConectado {
  slug: string;
  name: string;
  cor: string;
}

export function BoardShell({
  ws,
  board,
  nome,
  kind,
  cor,
  total,
  numFases,
  numCampos,
  podeConfigurar,
  conexoes,
  usuario,
  fases,
  pessoas,
  hoje,
  children,
}: {
  ws: string;
  board: string;
  nome: string;
  kind: "workflow" | "database";
  /** Cor do board (a mesma da sidebar). */
  cor: string;
  /** Cartões ativos do board. */
  total: number;
  numFases: number;
  numCampos: number;
  podeConfigurar: boolean;
  /** Boards ligados por relação (deste para lá e de lá para cá). */
  conexoes: BoardConectado[];
  usuario: string;
  fases: FaseNovoCard[];
  pessoas: Record<string, string>;
  hoje: string;
  children: React.ReactNode;
}) {
  const atual = usePathname();
  const params = useSearchParams();
  const base = `/w/${ws}/b/${board}`;
  const [faseAberta, setFaseAberta] = useState<FaseNovoCard | null>(null);
  const abrir = useCallback((faseId: string | null) => setFaseAberta(fases.find((f) => f.id === faseId) ?? fases[0] ?? null), [fases]);

  const fluxo = kind === "workflow" && numFases > 0;
  const naConfig = atual.startsWith(`${base}/settings`);
  const abaConfig = params.get("aba") ?? "";
  const emAutomacoes = naConfig && ["automacoes", "acoes", "execucoes"].includes(abaConfig);
  const naLista = atual.startsWith(`${base}/table`) || (atual.startsWith(`${base}/c/`) && (params.get("v") === "tabela" || !fluxo));
  const visoes = [...(fluxo ? [{ href: base, rotulo: "Kanban", ativa: !naConfig && !naLista }] : []), { href: `${base}/table`, rotulo: "Lista", ativa: !naConfig && naLista }];

  return (
    <CtxNovoCard.Provider value={abrir}>
      <div className="flex h-screen min-h-0 flex-col">
        {/* 1. Global */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-paper px-6 cabecalho-recolhido:border-b-0" data-faixa="global">
          <span className="grid size-7 shrink-0 place-items-center rounded text-on-cor" style={{ background: cor }} aria-hidden>
            {kind === "workflow" ? <Workflow className="size-4" /> : <Database className="size-4" />}
          </span>
          <Menu
            rotulo={`Informações de ${nome}`}
            gatilho={(p) => (
              <button type="button" {...p} className="flex min-w-0 items-center gap-1 rounded px-1 text-left hover:bg-bg">
                <h1 className="truncate text-[17px] font-semibold tracking-[-0.02em]">{nome}</h1>
                <ChevronDown className="size-4 shrink-0 text-ink-3" aria-hidden />
              </button>
            )}
            className="w-64 p-3"
          >
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]" data-info-board>
              <dt className="text-ink-3">Tipo</dt>
              <dd>{kind === "workflow" ? "Fluxo" : "Base"}</dd>
              <dt className="text-ink-3">Cartões</dt>
              <dd className="font-mono text-xs" data-total-cartoes>
                {plural(total, "cartão", "cartões")}
              </dd>
              {kind === "workflow" && (
                <>
                  <dt className="text-ink-3">Fases</dt>
                  <dd className="font-mono text-xs">{numFases}</dd>
                </>
              )}
              <dt className="text-ink-3">Campos</dt>
              <dd className="font-mono text-xs">{numCampos}</dd>
            </dl>
            {podeConfigurar && (
              <Link href={`${base}/settings`} className={cn(itemMenu, "mt-2 border-t border-line-2 pt-2")}>
                <Settings className="size-3.5" /> Configurar board
              </Link>
            )}
          </Menu>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={alternarCabecalho}
              className="hidden h-8 items-center gap-1 rounded px-2 text-[13px] text-ink-2 hover:bg-bg hover:text-ink cabecalho-recolhido:inline-flex"
              aria-label="Mostrar cabeçalho"
              title="Mostrar cabeçalho"
            >
              <ChevronDown className="size-4" />
            </button>
            <Menu
              rotulo="Ajuda"
              alinhar="end"
              className="w-72 p-3"
              gatilho={(p) => (
                <button type="button" {...p} className="grid size-8 place-items-center rounded text-ink-3 hover:bg-bg hover:text-ink" aria-label="Ajuda">
                  <CircleHelp className="size-4" />
                </button>
              )}
            >
              <p className="rotulo mb-2">Atalhos</p>
              <ul className="flex flex-col gap-1.5 text-[13px]">
                <li className="flex justify-between">
                  Buscar cartões <kbd className="font-mono text-xs text-ink-3">/</kbd>
                </li>
                <li className="flex justify-between">
                  Barra lateral <kbd className="font-mono text-xs text-ink-3">Ctrl+B</kbd>
                </li>
              </ul>
            </Menu>
            <Menu
              rotulo="Conta"
              alinhar="end"
              gatilho={(p) => (
                <button type="button" {...p} className="grid size-8 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent" aria-label={`Conta de ${usuario}`} title={usuario}>
                  {iniciais(usuario)}
                </button>
              )}
            >
              <p className="px-2 py-1.5 font-medium">{usuario}</p>
              <form action={sair}>
                <button type="submit" className={itemMenu}>
                  <LogOut className="size-3.5" /> Sair
                </button>
              </form>
            </Menu>
          </div>
        </header>

        {/* 2. Contexto */}
        <nav className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-paper px-6 cabecalho-recolhido:hidden" aria-label="Navegação do board" data-faixa="contexto">
          <Link
            href={fluxo ? base : `${base}/table`}
            aria-current={!naConfig ? "page" : undefined}
            className={cn("rounded px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg hover:text-ink", !naConfig && "bg-bg font-medium text-ink")}
          >
            {kind === "workflow" ? "Fluxo" : "Base"}
          </Link>
          {podeConfigurar && (
            <Link
              href={`${base}/settings?aba=automacoes`}
              aria-current={emAutomacoes ? "page" : undefined}
              className={cn("rounded px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg hover:text-ink", emAutomacoes && "bg-bg font-medium text-ink")}
            >
              Automações
            </Link>
          )}
          <Menu
            rotulo="Boards conectados"
            gatilho={(p) => (
              <button type="button" {...p} className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-[13px] text-ink-2 hover:bg-bg hover:text-ink">
                Conexões <ChevronDown className="size-3.5" aria-hidden />
              </button>
            )}
          >
            {conexoes.length ? (
              conexoes.map((c) => (
                <Link key={c.slug} href={`/w/${ws}/b/${c.slug}`} className={itemMenu}>
                  <i className="size-2 shrink-0 rounded-[2px]" style={{ background: c.cor }} aria-hidden />
                  {c.name}
                </Link>
              ))
            ) : (
              <p className="px-2 py-1.5 text-ink-3">Nenhum board conectado.</p>
            )}
          </Menu>
          {podeConfigurar && (
            <Button asChild variant="ghost" className="ml-auto" aria-label="Configurações do board">
              <Link href={`${base}/settings`} aria-current={naConfig && !emAutomacoes ? "page" : undefined}>
                <Settings /> Configurar
              </Link>
            </Button>
          )}
        </nav>

        {/* 3. Visões */}
        <div className="flex h-12 shrink-0 items-end bg-paper px-6 cabecalho-recolhido:hidden" data-faixa="visoes">
          <nav className="flex gap-3" aria-label="Visualizações">
            {visoes.map((v) => (
              <Link
                key={v.href}
                href={v.href}
                aria-current={v.ativa ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center border-b-2 px-4 py-3 text-sm text-ink-2 hover:text-ink",
                  v.ativa ? "border-accent font-medium text-accent hover:text-accent" : "border-transparent",
                )}
                data-aba-visao={v.rotulo}
              >
                {v.rotulo}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex h-12 items-center gap-2">
            {!naConfig && <BuscaEFiltro pessoas={pessoas} />}
            <button
              type="button"
              onClick={alternarCabecalho}
              className="grid size-8 place-items-center rounded text-ink-3 hover:bg-bg hover:text-ink"
              aria-label="Recolher cabeçalho"
              title="Recolher cabeçalho"
            >
              <ChevronUp className="size-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
      <NovoCard
        ws={ws}
        board={board}
        fase={faseAberta}
        aberto={faseAberta !== null}
        onOpenChange={(v) => !v && setFaseAberta(null)}
        pessoas={pessoas}
        hoje={hoje}
      />
    </CtxNovoCard.Provider>
  );
}

/** Busca (pill de 232px) e filtro, gravados na URL; "/" foca a busca. */
function BuscaEFiltro({ pessoas }: { pessoas: Record<string, string> }) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const filtros = lerFiltros(params);
  const [texto, setTexto] = useState(filtros.q);
  const campo = useRef<HTMLInputElement>(null);

  const aplicar = useCallback(
    (mudar: Record<string, string | null>) => {
      const p = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(mudar)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      const qs = p.toString();
      router.replace(qs ? `${caminho}?${qs}` : caminho, { scroll: false });
    },
    [params, caminho, router],
  );

  // Digitar: aplica 300 ms depois da última tecla.
  useEffect(() => {
    if (texto.trim() === filtros.q) return;
    const t = setTimeout(() => aplicar({ q: texto.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [texto, filtros.q, aplicar]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || alvo?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      campo.current?.focus();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const ativos = (filtros.resp ? 1 : 0) + (filtros.atrasados ? 1 : 0);
  return (
    <>
      <label className="flex h-8 w-[232px] items-center gap-2 rounded-full border border-line bg-paper px-3 text-[13px] text-ink-3 focus-within:border-accent" data-busca-board>
        <Search className="size-3.5 shrink-0" aria-hidden />
        <input
          ref={campo}
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar cartões"
          aria-label="Filtrar cartões"
          className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
        />
      </label>
      <Menu
        rotulo="Filtros"
        alinhar="end"
        className="w-64 p-3"
        gatilho={(p) => (
          <button
            type="button"
            {...p}
            className={cn("relative grid size-8 place-items-center rounded text-ink-3 hover:bg-bg hover:text-ink", ativos > 0 && "text-accent")}
            aria-label={ativos ? `Filtros (${ativos} ativos)` : "Filtros"}
            title="Filtros"
          >
            <Funnel className="size-4" />
            {ativos > 0 && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-accent" aria-hidden />}
          </button>
        )}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtro-resp">Responsável</Label>
            <NativeSelect id="filtro-resp" value={filtros.resp ?? ""} onChange={(e) => aplicar({ resp: e.target.value || null })}>
              <option value="">qualquer pessoa</option>
              {Object.entries(pessoas).map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </NativeSelect>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" className="size-4" checked={filtros.atrasados} onChange={(e) => aplicar({ atrasados: e.target.checked ? "1" : null })} />
            Só com prazo vencido
          </label>
          {temFiltro(filtros) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setTexto("");
                aplicar({ q: null, resp: null, atrasados: null });
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </Menu>
    </>
  );
}
