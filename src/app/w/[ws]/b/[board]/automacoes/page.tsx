// Automações do board (prompt PR 2, C2): página própria na faixa de contexto, com as sub-abas
// Automações (lista e editor) e Logs (execuções de automações e ações).
import Link from "next/link";
import type { CampoCondicao } from "@/components/condicoes/construtor";
import { Execucoes } from "@/components/automacoes/execucoes";
import { PaginaAutomacoes } from "@/components/automacoes/pagina-automacoes";
import { cn } from "@/lib/utils";
import { acoesDoBoard, automacoesDoBoard, estruturaParaAutomacoes, execucoesDoBoard } from "@/server/automacoes";
import { exigirBoard, exigirMembro, podeConfigurar } from "@/server/acesso";
import type { BoardCompleto } from "@/server/consultas";

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

export default async function PaginaAutomacoesBoard({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; board: string }>;
  searchParams: Promise<{ aba?: string; editar?: string; automacao?: string; acao?: string; status?: string }>;
}) {
  const { ws, board } = await params;
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  if (!podeConfigurar(ctx)) return <main className="p-6 text-sm text-ink-2">Apenas owner ou admin podem ver e editar as automações deste board.</main>;
  const sp = await searchParams;
  const aba = sp.aba === "logs" ? "logs" : "automacoes";
  const base = `/w/${ws}/b/${b.slug}/automacoes`;

  let conteudo: React.ReactNode;
  if (aba === "logs") {
    const [linhas, autos, acoes] = await Promise.all([
      execucoesDoBoard(b.id, { automacao: sp.automacao, acao: sp.acao, status: sp.status }),
      automacoesDoBoard(b.id),
      acoesDoBoard(b.id),
    ]);
    conteudo = (
      <div className="mx-auto w-full max-w-[1100px] px-6 py-6">
        <Execucoes
          ws={ws}
          board={b.slug}
          linhas={linhas}
          origens={[...autos.map((a) => ({ id: a.id, nome: a.nome, tipo: "automacao" as const })), ...acoes.map((a) => ({ id: a.id, nome: a.nome, tipo: "acao" as const }))]}
        />
      </div>
    );
  } else {
    const e = await estruturaParaAutomacoes(ctx.ws.id, b.id);
    const ctxAuto = {
      ws,
      board: b.slug,
      boardId: b.id,
      fases: b.fases.map((f) => ({ id: f.id, name: f.name })),
      campos: b.campos.map((c) => ({ id: c.id, slug: c.slug, name: c.name, type: c.type })),
      boards: e.boards,
      relacoes: e.relacoes,
      condicoes: camposCondicao(b),
    };
    conteudo = <PaginaAutomacoes ctx={ctxAuto} automacoes={await automacoesDoBoard(b.id)} editar={sp.editar ?? null} />;
  }

  return (
    <main className="flex min-h-full flex-col border-t border-line bg-bg">
      <nav className="flex h-11 shrink-0 items-end gap-3 border-b border-line bg-paper px-6" aria-label="Automações">
        {[
          { id: "automacoes", rotulo: "Automações", href: base },
          { id: "logs", rotulo: "Logs", href: `${base}?aba=logs` },
        ].map((t) => (
          <Link
            key={t.id}
            href={t.href}
            aria-current={aba === t.id ? "page" : undefined}
            className={cn("flex h-10 items-center border-b-2 px-3 text-sm text-ink-2 hover:text-ink", aba === t.id ? "border-accent font-medium text-accent hover:text-accent" : "border-transparent")}
          >
            {t.rotulo}
          </Link>
        ))}
      </nav>
      {conteudo}
    </main>
  );
}
