"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, KanbanSquare, LogOut } from "lucide-react";
import { sair } from "@/app/auth-actions";
import { NovoBoard } from "@/components/criar-board";
import { cn } from "@/lib/utils";

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
  const grupos = [
    { titulo: "Fluxos", icone: KanbanSquare, itens: boards.filter((b) => b.kind === "workflow") },
    { titulo: "Bases", icone: Database, itens: boards.filter((b) => b.kind === "database") },
  ];
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r bg-muted/60" aria-label="Navegação">
      <Link href={`/w/${ws}`} className="flex h-12 shrink-0 items-center gap-2 border-b px-4 font-semibold">
        {marca}
        <span className="truncate">{wsNome}</span>
      </Link>
      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
        {grupos.map((g) => (
          <div key={g.titulo}>
            <h2 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.titulo}</h2>
            {g.itens.length === 0 && <p className="px-2 text-xs text-muted-foreground">Nenhum</p>}
            <ul className="flex flex-col">
              {g.itens.map((b) => {
                const href = `/w/${ws}/b/${b.slug}`;
                const ativo = atual === href || atual.startsWith(`${href}/`);
                return (
                  <li key={b.slug}>
                    <Link
                      href={href}
                      aria-current={ativo ? "page" : undefined}
                      className={cn(
                        "flex h-8 items-center gap-2 rounded-md px-2 text-sm hover:bg-background",
                        ativo && "bg-background font-medium text-foreground shadow-xs",
                      )}
                    >
                      <g.icone className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{b.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {podeCriar && <NovoBoard ws={ws} />}
      </nav>
      <div className="flex items-center gap-2 border-t px-3 py-2 text-sm">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary" aria-hidden>
          {iniciais(usuario)}
        </span>
        <span className="min-w-0 flex-1 truncate">{usuario}</span>
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
