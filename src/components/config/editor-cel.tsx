"use client";
import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Textarea } from "@/components/ui/input";
import { parse } from "@/lib/expr";
import { cn } from "@/lib/utils";

/**
 * Editor de expressão CEL: valida ao digitar com o mesmo motor do servidor (parse)
 * e mostra erros com posição e os avisos do lint. O servidor valida de novo ao salvar.
 */
export function EditorCel({
  valor,
  onChange,
  rotulo,
  obrigatorio,
  linhas = 2,
  placeholder,
}: {
  valor: string;
  onChange: (v: string) => void;
  rotulo: string;
  obrigatorio?: boolean;
  linhas?: number;
  placeholder?: string;
}) {
  const r = useMemo(() => (valor.trim() ? parse(valor) : null), [valor]);
  return (
    <div className="flex flex-col gap-1">
      <Textarea
        aria-label={rotulo}
        rows={linhas}
        spellCheck={false}
        value={valor}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={r ? !r.ok : obrigatorio}
        className={cn("font-mono text-xs", r && !r.ok && "border-destructive focus-visible:ring-destructive")}
      />
      {r && !r.ok && (
        <p className="flex items-center gap-1 text-xs text-destructive" role="status">
          <XCircle className="size-3.5" /> {r.erro.mensagem}
          {r.erro.posicao && ` (posição ${r.erro.posicao.inicio + 1})`}
        </p>
      )}
      {r?.ok && (
        <>
          <p className="flex items-center gap-1 text-xs text-emerald-700" role="status">
            <CheckCircle2 className="size-3.5" /> Expressão válida
            {refsTexto(r.referencias) && <span className="text-muted-foreground">· usa {refsTexto(r.referencias)}</span>}
          </p>
          {r.avisos.map((a, i) => (
            <p key={i} className="flex items-center gap-1 text-xs text-amber-700">
              <AlertTriangle className="size-3.5" /> {a.tipo}: {a.mensagem}
            </p>
          ))}
        </>
      )}
    </div>
  );
}

function refsTexto(r: { card: string[]; pai: string[]; filhos: string[]; pais: string[]; boards: string[]; globais: string[] }) {
  const partes = [
    ...r.card.map((s) => `card.${s}`),
    ...r.pai.map((s) => `pai.${s}`),
    ...r.filhos.map((s) => `filhos("${s}")`),
    ...r.pais.map((s) => `pais("${s}")`),
    ...r.boards.map((s) => `board "${s}"`),
    ...r.globais,
  ];
  return partes.slice(0, 6).join(", ") + (partes.length > 6 ? "…" : "");
}
