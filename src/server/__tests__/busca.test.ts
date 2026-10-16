// Busca e filtros no servidor (kanban, lista, relação) e mover pela server action: sem acento, sem
// injeção (tudo parametrizado), coluna de ordenação validada contra os campos do board, escopo de
// workspace, e o core recusando destino que a UI esconde.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createCard } from "@/core";
import { criarBoard, criarCampo, criarRegra, criarWorkspace, definirTitulo } from "@/core/__tests__/fixtures";
import { lerFiltros } from "@/lib/filtros";
import { boardPorId, buscarCards } from "../consultas";
import { contagemPorFase, paginaDaFase } from "../kanban";
import { lerOrdem, paginaDaLista } from "../lista";

const sessao = vi.hoisted(() => ({ usuario: null as null | { id: string; email: string; nome: string } }));
vi.mock("@/server/auth/sessao", () => ({ usuarioAtual: async () => sessao.usuario }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const W = { slug: "", id: "", dono: "", board: "", outroBoard: "", fases: {} as Record<string, string>, cards: {} as Record<string, string>, campoOutro: "" };

beforeAll(async () => {
  const w = await criarWorkspace();
  Object.assign(W, { slug: w.ws.slug, id: w.ws.id, dono: w.user.id });
  const b = await criarBoard(w.ws.id, "pedidos", [{ name: "Novo" }, { name: "Enviado" }, { name: "Arquivo", terminal: true }]);
  W.board = b.id;
  W.fases = b.fases;
  const titulo = await criarCampo(b.id, { slug: "titulo", type: "text" });
  await definirTitulo(b.id, titulo);
  await criarCampo(b.id, { slug: "obs", type: "text" });
  for (const [k, t, obs] of [
    ["acao", "Ação de vitrine", "sem observação"],
    ["cafe", "Café da manhã", "entregar às 8h"],
    ["outro", "Pedido comum", "nada"],
  ])
    W.cards[k] = (await createCard({ boardId: b.id, props: { titulo: t, obs }, actor: w.actor })).id;
  // Regra que esconde "Enviado" na UI: nunca deixa entrar
  await criarRegra({ boardId: b.id, kind: "can_enter", phaseId: b.fases.Enviado, expr: "false", message: "Enviado está fechado." });
  // Outro workspace, com um card que não pode aparecer
  const w2 = await criarWorkspace();
  const b2 = await criarBoard(w2.ws.id, "pedidos", [{ name: "Novo" }]);
  W.outroBoard = b2.id;
  W.campoOutro = await criarCampo(b2.id, { slug: "segredo", type: "text" });
  await createCard({ boardId: b2.id, props: {}, actor: w2.actor });
});

const board = async () => (await boardPorId(W.id, W.board))!;
const filtros = (q: string) => lerFiltros(new URLSearchParams({ q }));

describe("busca sem acento", () => {
  it('"acao" acha "Ação" no kanban, na lista e na relação; vale também para o conteúdo dos campos', async () => {
    const b = await board();
    expect((await paginaDaFase(b, W.fases.Novo, filtros("acao"), 0)).map((c) => c.id)).toEqual([W.cards.acao]);
    expect((await paginaDaLista(W.id, b, filtros("ACAO"), lerOrdem({}), 0)).total).toBe(1);
    expect((await buscarCards(W.id, W.board, "acao")).map((c) => c.id)).toEqual([W.cards.acao]);
    expect((await paginaDaLista(W.id, b, filtros("as 8h"), lerOrdem({}), 0)).linhas.map((l) => l.id)).toEqual([W.cards.cafe]); // "às" no campo
  });
});

describe("segurança da busca e dos filtros", () => {
  it("injeção na busca é só texto: não acha nada e não quebra", async () => {
    const b = await board();
    for (const q of ["' or 1=1 --", "%' or '1'='1", "\'); drop table cards; --"]) {
      expect((await paginaDaLista(W.id, b, filtros(q), lerOrdem({}), 0)).total).toBe(0);
      expect((await contagemPorFase(b, filtros(q))).get(W.fases.Novo) ?? 0).toBe(0);
      expect(await buscarCards(W.id, W.board, q)).toEqual([]);
    }
    // % e _ são literais, não curingas
    expect((await paginaDaLista(W.id, b, filtros("%"), lerOrdem({}), 0)).total).toBe(0);
  });

  it("responsável que não é uuid é ignorado; coluna de ordenação inexistente ou de outro board não entra no SQL", async () => {
    expect(lerFiltros(new URLSearchParams({ resp: "x' or 1=1 --" })).resp).toBeNull();
    const b = await board();
    for (const coluna of ["campo_que_nao_existe", "x'; drop table cards; --", W.campoOutro]) {
      const r = await paginaDaLista(W.id, b, filtros(""), lerOrdem({ ordem: coluna, dir: "asc" }), 0);
      expect(r.total).toBe(3); // ordena pelo padrão, sem erro
    }
  });

  it("escopo: a busca de um workspace não vê cards de outro", async () => {
    expect(await buscarCards(W.id, W.outroBoard, "")).toEqual([]); // board de outro workspace
    const b = await board();
    expect((await paginaDaLista(W.id, b, filtros(""), lerOrdem({}), 0)).linhas.every((l) => Object.values(W.cards).includes(l.id))).toBe(true);
  });
});

describe("mover pela server action", () => {
  it("destino escondido pela UI (regra can_enter) é recusado pelo core; fase de outro board também", async () => {
    const { moverCardAction, moverNoKanbanAction } = await import("@/app/w/[ws]/actions");
    sessao.usuario = { id: W.dono, email: "dono@teste.dev", nome: "Dono" };
    const r = await moverCardAction(W.slug, "pedidos", W.cards.outro, W.fases.Enviado);
    expect(r).toEqual({ ok: false, motivo: "Enviado está fechado." });
    expect((await moverNoKanbanAction(W.slug, "pedidos", W.cards.outro, W.fases.Enviado)).ok).toBe(false);
    expect((await moverCardAction(W.slug, "pedidos", W.cards.outro, "00000000-0000-0000-0000-000000000000")).ok).toBe(false); // fase inexistente
    // permitido continua funcionando
    expect(await moverCardAction(W.slug, "pedidos", W.cards.outro, W.fases.Arquivo)).toEqual({ ok: true });
  });

  it("quem não é membro do workspace não move (nem descobre o board)", async () => {
    const { moverCardAction } = await import("@/app/w/[ws]/actions");
    const estranho = await criarWorkspace();
    sessao.usuario = { id: estranho.user.id, email: "x@teste.dev", nome: "Estranho" };
    await expect(moverCardAction(W.slug, "pedidos", W.cards.acao, W.fases.Arquivo)).rejects.toThrow();
  });
});
