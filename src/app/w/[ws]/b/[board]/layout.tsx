import { BoardShell } from "@/components/board-shell";
import type { FaseNovoCard } from "@/components/novo-card";
import { exigirBoard, exigirMembro, podeConfigurar } from "@/server/acesso";
import { dadosConfiguracao } from "@/server/config-board";
import { membrosDoWorkspace } from "@/server/consultas";
import { camposDaFase, hojeSP } from "./_lib/campos-da-fase";

export default async function LayoutBoard({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ws: string; board: string }>;
}) {
  const { ws, board } = await params;
  const ctx = await exigirMembro(ws);
  const b = await exigirBoard(ctx, board);
  const [config, membros] = await Promise.all([dadosConfiguracao(ctx.ws.id, b.id), membrosDoWorkspace(ctx.ws.id)]);
  const ajustes = config.ajustes.flatMap((a) => (a.fieldId && a.phaseId ? [{ ...a, fieldId: a.fieldId, phaseId: a.phaseId }] : []));
  const fases: FaseNovoCard[] = (b.fases.length ? b.fases : [{ id: null as string | null, name: "" }]).map((f) => ({
    id: f.id,
    nome: f.name,
    campos: camposDaFase(b, ajustes, f.id),
  }));
  return (
    <BoardShell
      ws={ws}
      board={b.slug}
      nome={b.name}
      kind={b.kind}
      podeConfigurar={podeConfigurar(ctx)}
      fases={fases}
      hoje={hojeSP()}
      pessoas={Object.fromEntries(membros.map((m) => [m.id, m.nome]))}
    >
      {children}
    </BoardShell>
  );
}
