"use client";
// Casco do board (docs/design/plexu-mockups.html, tela 01, ".top"): nome + contador mono, abas de
// visualização, busca que filtra os cartões do kanban, Configurar e "+ Novo cartão". O modal de criação
// é compartilhado com o "+" de cada fase do kanban via contexto.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { Plus, Search, Settings } from "lucide-react";
import { NovoCard, type FaseNovoCard } from "@/components/novo-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CtxNovoCard = createContext<(faseId: string | null) => void>(() => {});
const CtxBusca = createContext("");

/** Abre o modal de novo card numa fase (null = fase inicial). */
export const useNovoCard = () => useContext(CtxNovoCard);
/** Texto da busca do cabeçalho (filtra os cartões do kanban). */
export const useBuscaBoard = () => useContext(CtxBusca);

const plural = (n: number) => `${n} ${n === 1 ? "cartão" : "cartões"}`;

export function BoardShell({
  ws,
  board,
  nome,
  kind,
  total,
  podeConfigurar,
  fases,
  pessoas,
  hoje,
  children,
}: {
  ws: string;
  board: string;
  nome: string;
  kind: "workflow" | "database";
  /** Cartões ativos do board. */
  total: number;
  podeConfigurar: boolean;
  fases: FaseNovoCard[];
  pessoas: Record<string, string>;
  hoje: string;
  children: React.ReactNode;
}) {
  const atual = usePathname();
  const params = useSearchParams();
  const [busca, setBusca] = useState("");
  const base = `/w/${ws}/b/${board}`;
  const [faseAberta, setFaseAberta] = useState<FaseNovoCard | null>(null);
  const abrir = (faseId: string | null) => setFaseAberta(fases.find((f) => f.id === faseId) ?? fases[0] ?? null);

  const views = [...(kind === "workflow" ? [{ href: base, rotulo: "Kanban" }] : []), { href: `${base}/table`, rotulo: "Tabela" }];
  const naTabela = atual.startsWith(`${base}/table`) || (atual.startsWith(`${base}/c/`) && (params.get("v") === "tabela" || kind !== "workflow"));
  const naConfig = atual.startsWith(`${base}/settings`);
  const ativa = (href: string) => !naConfig && (href === base ? !naTabela : naTabela);
  const noKanban = kind === "workflow" && !naTabela && !naConfig;

  return (
    <CtxNovoCard.Provider value={abrir}>
      <CtxBusca.Provider value={busca}>
        <div className="flex h-screen min-h-0 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-paper px-5">
            <div className="flex min-w-0 items-baseline gap-2.5">
              <h1 className="truncate text-lg font-semibold tracking-[-0.02em]">{nome}</h1>
              <span className="rotulo shrink-0 normal-case tracking-normal" data-total-cartoes>
                {plural(total)}
              </span>
            </div>
            <nav className="ml-1 flex items-center gap-0.5" aria-label="Visualizações">
              {views.map((v) => (
                <Link
                  key={v.href}
                  href={v.href}
                  aria-current={ativa(v.href) ? "page" : undefined}
                  className={cn("rounded px-2.5 py-1.5 text-[13px] text-ink-2 hover:text-ink", ativa(v.href) && "bg-ink text-paper hover:text-paper")}
                >
                  {v.rotulo}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              {noKanban && (
                <label className="flex h-8 w-60 items-center gap-2 rounded border border-line px-2.5 text-[13px] text-ink-3 focus-within:border-accent">
                  <Search className="size-3.5 shrink-0" aria-hidden />
                  <input
                    type="search"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Filtrar cards…"
                    aria-label="Filtrar cartões"
                    className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
                  />
                </label>
              )}
              {podeConfigurar && (
                <Button asChild variant="ghost" aria-label="Configurações do board" title="Configurações">
                  <Link href={`${base}/settings`} aria-current={naConfig ? "page" : undefined}>
                    <Settings /> Configurar
                  </Link>
                </Button>
              )}
              <Button onClick={() => abrir(null)}>
                <Plus /> Novo cartão
              </Button>
            </div>
          </header>
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
      </CtxBusca.Provider>
    </CtxNovoCard.Provider>
  );
}
