// Moldura das configurações do board (prompt PR 2, C1): modal grande (até 1440px, raio 12px, véu),
// com as abas no topo e X para voltar ao board. Server component: as abas são links.
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ModalConfig({
  titulo,
  voltar,
  abas,
  ativa,
  children,
}: {
  titulo: string;
  voltar: string;
  abas: { id: string; rotulo: string; href: string }[];
  ativa: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-veu" aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={titulo} className="fixed inset-2 z-40 mx-auto flex max-w-[1440px] flex-col overflow-hidden rounded-xl bg-paper text-ink" data-modal-config>
        <header className="flex h-14 shrink-0 items-center gap-6 border-b border-line px-6">
          <h1 className="text-[15px] font-semibold">{titulo}</h1>
          <nav role="tablist" aria-label="Configurações" className="flex h-full items-end gap-3">
            {abas.map((a) => (
              <Link
                key={a.id}
                role="tab"
                aria-selected={ativa === a.id}
                href={a.href}
                scroll={false}
                className={cn("flex h-10 items-center border-b-2 px-3 text-sm text-ink-2 hover:text-ink", ativa === a.id ? "border-accent font-medium text-accent hover:text-accent" : "border-transparent")}
              >
                {a.rotulo}
              </Link>
            ))}
          </nav>
          <Link href={voltar} className="ml-auto grid size-8 place-items-center rounded-full border border-line text-ink-2 hover:bg-bg hover:text-ink" aria-label="Fechar configurações">
            <X className="size-4" />
          </Link>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </>
  );
}
