"use client";
// Tema claro/escuro (docs/DESIGN.md): atributo data-theme no <html>, escolha do usuário em
// localStorage["plexu-theme"]; sem escolha, segue o sistema. Sem cookie nem estado no servidor.
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export const CHAVE_TEMA = "plexu-theme";
type Tema = "light" | "dark";

/** Script inline no <head>, antes da pintura: aplica o tema sem piscar. */
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem("${CHAVE_TEMA}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`;

function aplicar(t: Tema) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(CHAVE_TEMA, t);
  } catch {
    // sem armazenamento (janela privada): vale só para esta página
  }
}

/** Alternador Claro/Escuro (segmentado, como no mockup). compacto: um botão com ícone (sidebar recolhida). */
export function AlternarTema({ compacto = false, className }: { compacto?: boolean; className?: string }) {
  const [tema, setTema] = useState<Tema | null>(null);
  useEffect(() => setTema(document.documentElement.dataset.theme === "dark" ? "dark" : "light"), []);
  const escolher = (t: Tema) => {
    aplicar(t);
    setTema(t);
  };
  if (compacto)
    return (
      <button
        type="button"
        onClick={() => escolher(tema === "dark" ? "light" : "dark")}
        aria-label={tema === "dark" ? "Usar tema claro" : "Usar tema escuro"}
        title={tema === "dark" ? "Tema claro" : "Tema escuro"}
        className={cn("rounded-[var(--r)] p-1.5 text-ink-3 hover:bg-paper hover:text-ink", className)}
      >
        {tema === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    );
  return (
    <div role="group" aria-label="Tema" className={cn("inline-flex overflow-hidden rounded-[var(--r)] border border-line bg-paper text-xs font-medium", className)} data-tema={tema ?? undefined}>
      {(
        [
          ["light", "Claro"],
          ["dark", "Escuro"],
        ] as const
      ).map(([t, rotulo]) => (
        <button
          key={t}
          type="button"
          aria-pressed={tema === t}
          onClick={() => escolher(t)}
          className={cn("px-3 py-1.5", tema === t ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}
