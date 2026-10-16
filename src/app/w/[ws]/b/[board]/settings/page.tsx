// Configurações do board (prompt PR 2, C1): modal grande com as abas Formulário inicial · Fases · Pessoas ·
// E-mail · Configurações do fluxo. Formulário inicial e Fases editam o formulário de uma fase (paleta,
// prévia, condicionais, opções avançadas). Automações e execuções foram para /automacoes.
import { redirect } from "next/navigation";
import type { CampoCondicao } from "@/components/condicoes/construtor";
import { ConfigCartao } from "@/components/config/config-cartao";
import { ConfigRegras } from "@/components/config/config-regras";
import { EditorFormulario } from "@/components/config/editor-formulario";
import { ModalConfig } from "@/components/config/modal-config";
import { ConfigAcoes } from "@/components/automacoes/config-acoes";
import { acoesDoBoard, estruturaParaAutomacoes } from "@/server/automacoes";
import { exigirBoard, exigirMembro, podeConfigurar } from "@/server/acesso";
import { camposArquivados, condicionaisDoBoard, dadosConfiguracao, dependenciasDoBoard } from "@/server/config-board";
import { membrosDoWorkspace, type BoardCompleto } from "@/server/consultas";

type Aba = "formulario" | "fases" | "pessoas" | "email" | "fluxo";

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

export default async function Configuracoes({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; board: string }>;
  searchParams: Promise<{ aba?: string; automacao?: string; acao?: string; status?: string; fase?: string }>;
}) {
  const { ws, board } = await params;
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  const sp = await searchParams;
  const base = `/w/${ws}/b/${b.slug}`;
  // Endereços antigos das abas
  if (sp.aba === "automacoes" || sp.aba === "acoes") redirect(`${base}/automacoes`);
  if (sp.aba === "execucoes") redirect(`${base}/automacoes?aba=logs${sp.automacao ? `&automacao=${sp.automacao}` : ""}${sp.status ? `&status=${sp.status}` : ""}`);
  if (!podeConfigurar(ctx)) {
    return <main className="p-6 text-sm text-ink-2">Apenas owner ou admin podem configurar este board.</main>;
  }
  const fluxo = b.kind === "workflow" && b.fases.length > 0;
  const abas: { id: Aba; rotulo: string }[] = [
    { id: "formulario", rotulo: fluxo ? "Formulário inicial" : "Formulário" },
    ...(fluxo ? [{ id: "fases" as const, rotulo: "Fases" }] : []),
    { id: "pessoas", rotulo: "Pessoas" },
    { id: "email", rotulo: "E-mail" },
    { id: "fluxo", rotulo: fluxo ? "Configurações do fluxo" : "Configurações da base" },
  ];
  const legado: Record<string, Aba> = { campos: "formulario", regras: "fluxo" };
  const pedida = (legado[sp.aba ?? ""] ?? sp.aba) as Aba | undefined;
  // ?aba=fases&fase=<primeira> é o formulário inicial
  const aba: Aba = pedida === "fases" && sp.fase && sp.fase === b.fases[0]?.id ? "formulario" : abas.some((a) => a.id === pedida) ? pedida! : "formulario";

  const [d, dependencias, arquivados] = await Promise.all([dadosConfiguracao(ctx.ws.id, b.id), dependenciasDoBoard(b.id), camposArquivados(b.id)]);
  const { lista: condicionais, gerados } = condicionaisDoBoard(b.settings as Record<string, unknown>);
  const fases = b.fases.map((f) => ({ id: f.id, name: f.name, isTerminal: f.isTerminal, color: f.color, allowCreate: f.allowCreate, sla: f.sla, descricao: f.descricao }));
  const condicoes = camposCondicao(b);
  const camposDe = (boardId: string) => d.camposWs.filter((c) => c.boardId === boardId).map(({ slug, name, type }) => ({ slug, name, type }));
  const nomeBoard = (id: string) => d.boards.find((x) => x.id === id)?.name ?? "";
  const relacoesVia = [
    ...b.campos
      .filter((c) => c.type === "relation")
      .map((c) => {
        const alvo = String((c.config.relation as { target_board?: string } | undefined)?.target_board ?? "");
        return { id: c.id, rotulo: `${c.name} (deste board)`, nome: c.name, board: nomeBoard(alvo), campos: camposDe(alvo) };
      }),
    ...d.relacoesEntrando.map((r) => ({ id: r.id, rotulo: `${r.boardName} · ${r.name}`, nome: r.name, board: r.boardName, campos: camposDe(r.boardId) })),
  ];
  const ctxCampos = {
    ws,
    board: b.slug,
    titleFieldId: b.titleFieldId,
    fases,
    ajustes: d.ajustes.flatMap((a) => (a.fieldId && a.phaseId ? [{ ...a, fieldId: a.fieldId, phaseId: a.phaseId }] : [])),
    boards: d.boards,
    relacoesVia,
    camposPorBoard: Object.fromEntries(d.boards.map((x) => [x.id, d.camposWs.filter((c) => c.boardId === x.id && c.type !== "relation").map(({ id, name, type }) => ({ id, name, type }))])),
    campos: b.campos,
    condicoes,
    dependencias,
    geradosCondicionais: { visivel: gerados.visivel, obrigatorio: gerados.obrigatorio },
  };

  let conteudo: React.ReactNode;
  if (aba === "formulario" || aba === "fases") {
    conteudo = <EditorFormulario ctx={ctxCampos} modo={fluxo ? (aba === "formulario" ? "inicial" : "fases") : "base"} fases={fases} faseId={sp.fase ?? null} condicionais={condicionais} arquivados={arquivados} />;
  } else if (aba === "pessoas") {
    const membros = await membrosDoWorkspace(ctx.ws.id);
    conteudo = (
      <div className="mx-auto w-full max-w-3xl overflow-y-auto px-6 py-6">
        <h2 className="mb-1 text-[15px] font-semibold">Pessoas</h2>
        <p className="mb-4 text-[13px] text-ink-2">Quem tem acesso a este board: os membros do workspace. Papéis (owner, admin, membro) ficam nas configurações do workspace.</p>
        <ul className="divide-y divide-line-2 rounded border border-line" data-pessoas-board>
          {membros.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-medium">{m.nome}</span>
              <span className="text-ink-3">{m.email}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (aba === "email") {
    conteudo = (
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <h2 className="mb-1 text-[15px] font-semibold">E-mail</h2>
        <p className="text-[13px] text-ink-2">Em breve: caixa de entrada do board e modelos de e-mail para as automações.</p>
      </div>
    );
  } else {
    const e = await estruturaParaAutomacoes(ctx.ws.id, b.id);
    const ctxAuto = {
      ws,
      board: b.slug,
      boardId: b.id,
      fases: fases.map((f) => ({ id: f.id, name: f.name })),
      campos: b.campos.map((c) => ({ id: c.id, slug: c.slug, name: c.name, type: c.type })),
      boards: e.boards,
      relacoes: e.relacoes,
      condicoes,
    };
    conteudo = (
      <div className="min-h-0 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-6 py-6">
          {b.kind === "workflow" && (
            <ConfigCartao ws={ws} board={b.slug} campos={b.campos} titleFieldId={b.titleFieldId} atuais={b.settings.kanban_fields ?? []} prazo={b.settings.kanban_due_field ?? null} />
          )}
          <ConfigRegras
            ws={ws}
            board={b.slug}
            fases={fases}
            campos={b.campos.map((c) => ({ id: c.id, name: c.name }))}
            condicoes={condicoes}
            regras={d.regras
              .filter((r) => !gerados.regras.includes(r.id))
              .map((r) => ({ id: r.id, kind: r.kind, phaseIds: r.phaseIds, fromPhaseId: r.fromPhaseId, fieldId: r.fieldId, expr: r.expr, message: r.message, onFail: r.onFail, enabled: r.enabled }))}
          />
          <ConfigAcoes ctx={ctxAuto} acoes={await acoesDoBoard(b.id)} />
        </div>
      </div>
    );
  }

  const href = (id: Aba) => `${base}/settings?aba=${id}`;
  return (
    <ModalConfig titulo={`Configurações · ${b.name}`} voltar={base} abas={abas.map((a) => ({ ...a, href: href(a.id) }))} ativa={aba}>
      {conteudo}
    </ModalConfig>
  );
}
