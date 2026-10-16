import { BoardShell, SCRIPT_CABECALHO } from "@/components/board-shell";
import type { FaseNovoCard } from "@/components/novo-card";
import { coresDosBoards } from "@/lib/cores";
import { exigirBoard, exigirMembro, podeConfigurar } from "@/server/acesso";
import { ajustesDoBoard } from "@/server/config-board";
import { boardsConectados, boardsDoWorkspace, membrosDoWorkspace } from "@/server/consultas";
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
  const [ajustes, membros, todos, conectados] = await Promise.all([
    ajustesDoBoard(b.id),
    membrosDoWorkspace(ctx.ws.id),
    boardsDoWorkspace(ctx.ws.id),
    boardsConectados(ctx.ws.id, b),
  ]);
  const cores = coresDosBoards(todos);
  const fases: FaseNovoCard[] = (b.fases.length ? b.fases : [{ id: null as string | null, name: "" }]).map((f) => ({
    id: f.id,
    nome: f.name,
    campos: camposDaFase(b, ajustes, f.id),
    nomes: Object.fromEntries(b.campos.map((c) => [c.id, c.name])),
  }));
  return (
    <>
      {/* Aplica o cabeçalho recolhido antes da pintura (sem piscar). */}
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_CABECALHO }} />
      <BoardShell
        ws={ws}
        board={b.slug}
        nome={b.name}
        kind={b.kind}
        cor={cores.get(b.id) ?? "var(--f5)"}
        total={todos.find((x) => x.id === b.id)?.cards ?? 0}
        numFases={b.fases.length}
        numCampos={b.campos.length}
        podeConfigurar={podeConfigurar(ctx)}
        conexoes={todos.filter((x) => conectados.includes(x.id)).map((x) => ({ slug: x.slug, name: x.name, cor: cores.get(x.id) ?? "var(--f5)" }))}
        usuario={ctx.usuario.nome}
        fases={fases}
        hoje={hojeSP()}
        pessoas={Object.fromEntries(membros.map((m) => [m.id, m.nome]))}
      >
        {children}
      </BoardShell>
    </>
  );
}
