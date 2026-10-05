"use client";
// Sidebar do workspace (docs/design/plexu-mockups.html, tela 01): 232px, fundo --bg, borda direita de 1px;
// grupos Fluxos / Bases / Workspaces com rótulo mono; item com marcador na cor do board; ativo em --paper.
// Recolhível (botão e Ctrl/⌘+B), estado em localStorage aplicado antes da pintura.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Archive, LayoutGrid, LogOut, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { sair } from "@/app/auth-actions";
import { NovoBoard } from "@/components/criar-board";
import { AlternarTema } from "@/components/tema";
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

/** Cor do board: fluxos alternam as cores de fase (--f1..--f4); bases usam o cinza --f5. */
export function corDoBoard(kind: BoardSidebar["kind"], indice: number) {
  return kind === "database" ? "var(--f5)" : `var(--f${(indice % 4) + 1})`;
}

const item = "flex items-center gap-2 rounded border border-transparent px-2 py-[5px] text-[13.5px] text-ink-2 hover:bg-paper hover:text-ink recolhida:justify-center recolhida:px-0";
const ativoCls = "border-line bg-paper font-semibold text-ink";

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="rotulo mb-1.5 mt-3.5 px-2 recolhida:sr-only">{titulo}</h2>
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

export function Sidebar({
  ws,
  wsNome,
  usuario,
  boards,
  podeCriar,
  marca,
  logo,
  workspaces = [],
  arquivados = 0,
  configuraWorkspace = false,
}: {
  ws: string;
  wsNome: string;
  usuario: string;
  boards: BoardSidebar[];
  podeCriar: boolean;
  /** Símbolo (sidebar recolhida). */
  marca: React.ReactNode;
  /** Logo completo (sidebar aberta). */
  logo: React.ReactNode;
  /** Workspaces ativos do usuário (arquivados não aparecem). */
  workspaces?: { slug: string; name: string }[];
  /** Quantos arquivados o usuário (owner) pode restaurar. */
  arquivados?: number;
  /** Owner/admin: link para as configurações do workspace. */
  configuraWorkspace?: boolean;
}) {
  const atual = usePathname();
  const [recolhida, alternar] = useRecolhida();
  const fluxos = boards.filter((b) => b.kind === "workflow");
  const bases = boards.filter((b) => b.kind === "database");
  const linkBoard = (b: BoardSidebar, i: number) => {
    const href = `/w/${ws}/b/${b.slug}`;
    const ativo = atual === href || atual.startsWith(`${href}/`);
    return (
      <li key={b.slug}>
        <Link href={href} aria-current={ativo ? "page" : undefined} title={b.name} className={cn(item, ativo && ativoCls)}>
          <i className="size-2 shrink-0 rounded-[2px]" style={{ background: corDoBoard(b.kind, i) }} aria-hidden />
          <span className="truncate recolhida:sr-only">{b.name}</span>
        </Link>
      </li>
    );
  };
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[232px] flex-col border-r border-line bg-bg transition-[width] recolhida:w-14" aria-label="Navegação">
      <div className="flex shrink-0 items-center gap-1 px-3 pb-2 pt-4 recolhida:flex-col recolhida:px-0">
        <Link href={`/w/${ws}`} className="flex min-w-0 flex-1 items-center px-1 recolhida:hidden" title={wsNome} aria-label={`Plexu · ${wsNome}`}>
          {logo}
        </Link>
        <Link href={`/w/${ws}`} className="hidden recolhida:block" title={wsNome} aria-label={`Plexu · ${wsNome}`}>
          {marca}
        </Link>
        <button
          type="button"
          onClick={alternar}
          aria-expanded={!recolhida}
          aria-label={recolhida ? "Expandir barra lateral" : "Recolher barra lateral"}
          title={`${recolhida ? "Expandir" : "Recolher"} (Ctrl+B)`}
          className="rounded p-1.5 text-ink-3 hover:bg-paper hover:text-ink"
        >
          {recolhida ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3 recolhida:px-2">
        <Grupo titulo="Fluxos">
          {fluxos.length ? fluxos.map(linkBoard) : <li className="px-2 text-xs text-ink-3 recolhida:hidden">Nenhum</li>}
        </Grupo>
        <Grupo titulo="Bases">
          {bases.length ? bases.map(linkBoard) : <li className="px-2 text-xs text-ink-3 recolhida:hidden">Nenhuma</li>}
        </Grupo>
        {podeCriar && (
          <div className="mt-2 recolhida:hidden">
            <NovoBoard ws={ws} />
          </div>
        )}
        <div className="mt-auto" data-lista-workspaces>
          <Grupo titulo="Workspaces">
            {workspaces.map((w) => (
              <li key={w.slug}>
                <Link href={`/w/${w.slug}`} aria-current={w.slug === ws ? "true" : undefined} title={w.name} className={cn(item, w.slug === ws && "text-ink")}>
                  <LayoutGrid className="size-4 shrink-0 text-ink-3" />
                  <span className="truncate recolhida:sr-only">{w.name}</span>
                </Link>
              </li>
            ))}
            {arquivados > 0 && (
              <li>
                <Link href="/arquivados" title="Workspaces arquivados" className={item}>
                  <Archive className="size-4 shrink-0 text-ink-3" />
                  <span className="truncate recolhida:sr-only">Arquivados ({arquivados})</span>
                </Link>
              </li>
            )}
            {configuraWorkspace && (
              <li>
                <Link
                  href={`/w/${ws}/settings`}
                  aria-current={atual === `/w/${ws}/settings` ? "page" : undefined}
                  title="Configurações do workspace"
                  className={cn(item, atual === `/w/${ws}/settings` && ativoCls)}
                >
                  <Settings className="size-4 shrink-0 text-ink-3" />
                  <span className="truncate recolhida:sr-only">Configurações do workspace</span>
                </Link>
              </li>
            )}
          </Grupo>
        </div>
      </nav>
      <div className="flex flex-col gap-2 border-t border-line px-3 py-2.5 recolhida:items-center recolhida:px-0">
        <div className="flex items-center gap-2 text-[13px] recolhida:flex-col">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-accent" aria-hidden>
            {iniciais(usuario)}
          </span>
          <span className="min-w-0 flex-1 recolhida:sr-only">
            <span className="block truncate text-ink">{usuario}</span>
            <span className="rotulo block truncate normal-case tracking-normal">{wsNome}</span>
          </span>
          <form action={sair}>
            <button type="submit" className="rounded p-1.5 text-ink-3 hover:bg-paper hover:text-ink" aria-label="Sair" title="Sair">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
        {recolhida ? <AlternarTema compacto /> : <AlternarTema className="self-start" />}
      </div>
    </aside>
  );
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "?") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}
