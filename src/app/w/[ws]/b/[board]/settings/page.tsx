import { ConfigCampos } from "@/components/config/config-campos";
import { ConfigFases } from "@/components/config/config-fases";
import { ConfigRegras } from "@/components/config/config-regras";
import { exigirBoard, exigirMembro, podeConfigurar } from "@/server/acesso";
import { dadosConfiguracao } from "@/server/config-board";

export default async function Configuracoes({ params }: { params: Promise<{ ws: string; board: string }> }) {
  const { ws, board } = await params;
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  if (!podeConfigurar(ctx)) {
    return <main className="p-6 text-sm text-muted-foreground">Apenas owner ou admin podem configurar este board.</main>;
  }
  const d = await dadosConfiguracao(ctx.ws.id, b.id);
  const fases = b.fases.map((f) => ({ id: f.id, name: f.name, isTerminal: f.isTerminal }));
  const relacoesVia = [
    ...b.campos.filter((c) => c.type === "relation").map((c) => ({ id: c.id, rotulo: `${c.name} (deste board)` })),
    ...d.relacoesEntrando.map((r) => ({ id: r.id, rotulo: `${r.boardName} · ${r.name}` })),
  ];
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      {b.kind === "workflow" && <ConfigFases ws={ws} board={b.slug} fases={fases} />}
      <ConfigCampos
        ws={ws}
        board={b.slug}
        titleFieldId={b.titleFieldId}
        fases={fases}
        ajustes={d.ajustes.flatMap((a) => (a.fieldId && a.phaseId ? [{ ...a, fieldId: a.fieldId, phaseId: a.phaseId }] : []))}
        boards={d.boards}
        relacoesVia={relacoesVia}
        campos={b.campos}
      />
      <ConfigRegras
        ws={ws}
        board={b.slug}
        fases={fases}
        campos={b.campos.map((c) => ({ id: c.id, name: c.name }))}
        regras={d.regras.map((r) => ({ id: r.id, kind: r.kind, phaseId: r.phaseId, fieldId: r.fieldId, expr: r.expr, message: r.message, onFail: r.onFail, enabled: r.enabled }))}
      />
    </main>
  );
}
