import { BoardShell } from "@/components/board-shell";
import type { FaseNovoCard } from "@/components/novo-card";
import { exigirBoard, exigirMembro, podeConfigurar } from "@/server/acesso";
import { ajustesDoBoard } from "@/server/config-board";
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
  const [ajustes, membros] = await Promise.all([ajustesDoBoard(b.id), membrosDoWorkspace(ctx.ws.id)]);
  const fases: FaseNovoCard[] = (b.fases.length ? b.fases : [{ id: null as string | null, name: "" }]).map((f) => ({
    id: f.id,
    nome: f.name,
    campos: camposDaFase(b, ajustes, f.id),
    nomes: Object.fromEntries(b.campos.map((c) => [c.id, c.name])),
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
