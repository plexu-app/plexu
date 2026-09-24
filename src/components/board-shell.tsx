"use client";
// Casco do board: cabeçalho (nome, views, configurações, + Novo card) e o modal de criação,
// compartilhado com o "+" de cada fase do kanban via contexto.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { Plus, Settings } from "lucide-react";
import { NovoCard, type FaseNovoCard } from "@/components/novo-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CtxNovoCard = createContext<(faseId: string | null) => void>(() => {});

/** Abre o modal de novo card numa fase (null = fase inicial). */
export const useNovoCard = () => useContext(CtxNovoCard);

export function BoardShell({
  ws,
  board,
  nome,
  kind,
  podeConfigurar,
  fases,
  pessoas,
  children,
}: {
  ws: string;
  board: string;
  nome: string;
  kind: "workflow" | "database";
  podeConfigurar: boolean;
  fases: FaseNovoCard[];
  pessoas: Record<string, string>;
  children: React.ReactNode;
}) {
  const atual = usePathname();
  const busca = useSearchParams();
  const base = `/w/${ws}/b/${board}`;
  const [faseAberta, setFaseAberta] = useState<FaseNovoCard | null>(null);
  const abrir = (faseId: string | null) => setFaseAberta(fases.find((f) => f.id === faseId) ?? fases[0] ?? null);

  const views = [...(kind === "workflow" ? [{ href: base, rotulo: "Kanban" }] : []), { href: `${base}/table`, rotulo: "Tabela" }];
  const naTabela = atual.startsWith(`${base}/table`) || (atual.startsWith(`${base}/c/`) && (busca.get("v") === "tabela" || kind !== "workflow"));
  const naConfig = atual.startsWith(`${base}/settings`);
  const ativa = (href: string) => !naConfig && (href === base ? !naTabela : naTabela);

  return (
    <CtxNovoCard.Provider value={abrir}>
      <div className="flex h-screen min-h-0 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b px-6">
          <h1 className="truncate text-base font-semibold">{nome}</h1>
          <nav className="flex items-center gap-1" aria-label="Visualizações">
            {views.map((v) => (
              <Link
                key={v.href}
                href={v.href}
                aria-current={ativa(v.href) ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                  ativa(v.href) && "bg-muted font-medium text-foreground",
                )}
              >
                {v.rotulo}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {podeConfigurar && (
              <Button asChild variant="ghost" size="sm" aria-label="Configurações do board" title="Configurações">
                <Link href={`${base}/settings`} aria-current={atual.startsWith(`${base}/settings`) ? "page" : undefined}>
                  <Settings /> Configurações
                </Link>
              </Button>
            )}
            <Button size="sm" onClick={() => abrir(null)}>
              <Plus /> Novo card
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
      />
    </CtxNovoCard.Provider>
  );
}
