"use client";
// Painel suspenso simples (menus do cabeçalho, filtros, ⋯ da fase): abre no clique do gatilho, fecha
// no clique fora, no Esc e ao escolher um item. Sem dependência nova: o projeto só tem o Dialog do Radix.
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const CtxFechar = createContext<() => void>(() => {});
/** Fecha o menu de dentro de um item (ex.: depois de navegar). */
export const useFecharMenu = () => useContext(CtxFechar);

export function Menu({
  gatilho,
  children,
  alinhar = "start",
  className,
  rotulo,
}: {
  /** Renderiza o botão que abre o painel; recebe as props de acessibilidade e o clique. */
  gatilho: (p: { "aria-expanded": boolean; "aria-controls": string; "aria-haspopup": "dialog"; onClick: () => void }) => React.ReactNode;
  children: React.ReactNode;
  alinhar?: "start" | "end";
  className?: string;
  /** Nome acessível do painel. */
  rotulo: string;
}) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);
  return (
    <div ref={raiz} className="relative">
      {gatilho({ "aria-expanded": aberto, "aria-controls": id, "aria-haspopup": "dialog", onClick: () => setAberto((v) => !v) })}
      {aberto && (
        <div
          id={id}
          role="dialog"
          aria-label={rotulo}
          className={cn(
            "absolute top-full z-40 mt-1 min-w-48 rounded border border-line bg-paper p-1 text-[13px] text-ink",
            alinhar === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          <CtxFechar.Provider value={() => setAberto(false)}>{children}</CtxFechar.Provider>
        </div>
      )}
    </div>
  );
}

/** Item clicável do menu (link ou ação). */
export const itemMenu = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-ink-2 hover:bg-bg hover:text-ink disabled:opacity-50";
