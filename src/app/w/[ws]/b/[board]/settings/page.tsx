import Link from "next/link";
import type { CampoCondicao } from "@/components/condicoes/construtor";
import { ConfigCampos } from "@/components/config/config-campos";
import { ConfigCartao } from "@/components/config/config-cartao";
import { ConfigFases } from "@/components/config/config-fases";
import { ConfigRegras } from "@/components/config/config-regras";
import { cn } from "@/lib/utils";
import { exigirBoard, exigirMembro, podeConfigurar } from "@/server/acesso";
import { dadosConfiguracao } from "@/server/config-board";
import type { BoardCompleto } from "@/server/consultas";

type Aba = "fases" | "campos" | "regras";

/** Campos oferecidos no construtor de condições: campos do board (exceto relações) e as fases. */
function camposCondicao(b: BoardCompleto): CampoCondicao[] {
  const opcoes = (c: BoardCompleto["campos"][number]) =>
    Array.isArray(c.config.options) ? (c.config.options as unknown[]).map((o) => (typeof o === "string" ? o : String((o as { value?: string }).value ?? ""))) : undefined;
  const fases = b.fases.map((f) => f.name);
  return [
    ...b.campos.filter((c) => c.type !== "relation").map((c) => ({ caminho: `card.${c.slug}`, nome: c.name, tipo: c.type, opcoes: opcoes(c) })),
    ...(fases.length
      ? [
          { caminho: "fase", nome: "Fase atual", tipo: "fase", opcoes: fases },
          { caminho: "fase_origem", nome: "Fase de origem", tipo: "fase", opcoes: fases },
          { caminho: "fase_destino", nome: "Fase de destino", tipo: "fase", opcoes: fases },
        ]
      : []),
  ];
}

export default async function Configuracoes({ params, searchParams }: { params: Promise<{ ws: string; board: string }>; searchParams: Promise<{ aba?: string }> }) {
  const { ws, board } = await params;
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  if (!podeConfigurar(ctx)) {
    return <main className="p-6 text-sm text-muted-foreground">Apenas owner ou admin podem configurar este board.</main>;
  }
  const abas: { id: Aba; rotulo: string }[] = [
    ...(b.kind === "workflow" ? [{ id: "fases" as const, rotulo: "Fases" }] : []),
    { id: "campos", rotulo: "Campos" },
    { id: "regras", rotulo: "Regras" },
  ];
  const pedida = (await searchParams).aba as Aba | undefined;
  const aba: Aba = abas.some((a) => a.id === pedida) ? pedida! : abas[0].id;

  const d = await dadosConfiguracao(ctx.ws.id, b.id);
  const fases = b.fases.map((f) => ({ id: f.id, name: f.name, isTerminal: f.isTerminal, color: f.color }));
  const condicoes = camposCondicao(b);
  const relacoesVia = [
    ...b.campos.filter((c) => c.type === "relation").map((c) => ({ id: c.id, rotulo: `${c.name} (deste board)` })),
    ...d.relacoesEntrando.map((r) => ({ id: r.id, rotulo: `${r.boardName} · ${r.name}` })),
  ];
  const base = `/w/${ws}/b/${b.slug}/settings`;
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-6 py-4">
      <nav role="tablist" aria-label="Configurações" className="flex gap-1 border-b">
        {abas.map((a) => (
          <Link
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            href={`${base}?aba=${a.id}`}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground", aba === a.id ? "border-primary font-medium text-foreground" : "border-transparent")}
          >
            {a.rotulo}
          </Link>
        ))}
      </nav>
      {aba === "fases" && <ConfigFases ws={ws} board={b.slug} fases={fases} />}
      {aba === "campos" && (
        <>
          <ConfigCampos
            ws={ws}
            board={b.slug}
            titleFieldId={b.titleFieldId}
            fases={fases}
            ajustes={d.ajustes.flatMap((a) => (a.fieldId && a.phaseId ? [{ ...a, fieldId: a.fieldId, phaseId: a.phaseId }] : []))}
            boards={d.boards}
            relacoesVia={relacoesVia}
            campos={b.campos}
            condicoes={condicoes}
          />
          {b.kind === "workflow" && (
            <ConfigCartao
              ws={ws}
              board={b.slug}
              campos={b.campos}
              titleFieldId={b.titleFieldId}
              atuais={b.settings.kanban_fields ?? []}
              prazo={b.settings.kanban_due_field ?? null}
            />
          )}
        </>
      )}
      {aba === "regras" && (
        <ConfigRegras
          ws={ws}
          board={b.slug}
          fases={fases}
          campos={b.campos.map((c) => ({ id: c.id, name: c.name }))}
          condicoes={condicoes}
          regras={d.regras.map((r) => ({ id: r.id, kind: r.kind, phaseId: r.phaseId, fieldId: r.fieldId, expr: r.expr, message: r.message, onFail: r.onFail, enabled: r.enabled }))}
        />
      )}
    </main>
  );
}
