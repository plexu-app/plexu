"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Database, KanbanSquare, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { sair } from "@/app/auth-actions";
import { NovoBoard } from "@/components/criar-board";
import { cn } from "@/lib/utils";

const CHAVE = "plexu:sidebar";

/** Script inline no início do layout do workspace: aplica o estado salvo antes da pintura. */
export const SCRIPT_SIDEBAR = `try{if(localStorage.getItem("${CHAVE}")==="recolhida")document.documentElement.dataset.sidebar="recolhida"}catch(e){}`;

/** Sidebar recolhível: botão e atalho Ctrl/⌘+B; estado em localStorage. */
function useRecolhida() {
  const [recolhida, setRecolhida] = useState(false);
  useEffect(() => setRecolhida(document.documentElement.dataset.sidebar === "recolhida"), []);
  const alternar = useCallback(() => {
    const nova = document.documentElement.dataset.sidebar !== "recolhida";
    if (nova) document.documentElement.dataset.sidebar = "recolhida";
    else delete document.documentElement.dataset.sidebar;
    try {
      localStorage.setItem(CHAVE, nova ? "recolhida" : "aberta");
    } catch {
      // sem armazenamento (janela privada): vale só para esta página
    }
    setRecolhida(nova);
  }, []);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        alternar();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [alternar]);
  return [recolhida, alternar] as const;
}

export interface BoardSidebar {
  slug: string;
  name: string;
  kind: "workflow" | "database";
}

export function Sidebar({
  ws,
  wsNome,
  usuario,
  boards,
  podeCriar,
  marca,
}: {
  ws: string;
  wsNome: string;
  usuario: string;
  boards: BoardSidebar[];
  podeCriar: boolean;
  marca: React.ReactNode;
}) {
  const atual = usePathname();
  const [recolhida, alternar] = useRecolhida();
  const grupos = [
    { titulo: "Fluxos", icone: KanbanSquare, itens: boards.filter((b) => b.kind === "workflow") },
    { titulo: "Bases", icone: Database, itens: boards.filter((b) => b.kind === "database") },
  ];
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r bg-muted/60 transition-[width] recolhida:w-14" aria-label="Navegação">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b pr-2 recolhida:flex-col recolhida:justify-center recolhida:pr-0">
        <Link href={`/w/${ws}`} className="flex min-w-0 flex-1 items-center gap-2 px-4 font-semibold recolhida:hidden" title={wsNome}>
          {marca}
          <span className="truncate">{wsNome}</span>
        </Link>
        <button
          type="button"
          onClick={alternar}
          aria-expanded={!recolhida}
          aria-label={recolhida ? "Expandir barra lateral" : "Recolher barra lateral"}
          title={`${recolhida ? "Expandir" : "Recolher"} (Ctrl+B)`}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
        >
          {recolhida ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
        {grupos.map((g) => (
          <div key={g.titulo}>
            <h2 className="px-2 pb-1 recolhida:sr-only text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.titulo}</h2>
            {g.itens.length === 0 && <p className="px-2 recolhida:hidden text-xs text-muted-foreground">Nenhum</p>}
            <ul className="flex flex-col">
              {g.itens.map((b) => {
                const href = `/w/${ws}/b/${b.slug}`;
                const ativo = atual === href || atual.startsWith(`${href}/`);
                return (
                  <li key={b.slug}>
                    <Link
                      href={href}
                      aria-current={ativo ? "page" : undefined}
                      title={b.name}
                      className={cn(
                        "flex h-8 items-center gap-2 rounded-md px-2 text-sm hover:bg-background recolhida:justify-center",
                        ativo && "bg-background font-medium text-foreground shadow-xs",
                      )}
                    >
                      <g.icone className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate recolhida:sr-only">{b.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {podeCriar && (
          <div className="recolhida:hidden">
            <NovoBoard ws={ws} />
          </div>
        )}
      </nav>
      <div className="flex items-center gap-2 border-t px-3 py-2 text-sm recolhida:flex-col recolhida:px-0">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary-strong" aria-hidden>
          {iniciais(usuario)}
        </span>
        <span className="min-w-0 flex-1 truncate recolhida:sr-only">{usuario}</span>
        <form action={sair}>
          <button type="submit" className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground" aria-label="Sair" title="Sair">
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "?") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}
