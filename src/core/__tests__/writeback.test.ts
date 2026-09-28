// Espelho editável (lookup "ref" + editable_writeback): editar o espelho grava no card de origem pelo
// core (mesma transação, regras can_edit de lá), o recálculo propaga para todos os espelhos, e não
// há loop (origem → espelhos → origem).
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { cards, events } from "../../db/schema";
import { createCard, linkCards, updateFields } from "../cards";
import { CoreError, type Actor } from "../types";
import { estadoDosCampos } from "../vistas";
import { criarBoard, criarCampo, criarRegra, criarWorkspace, definirTitulo } from "./fixtures";

let actor: Actor;
let userId: string;
const F = { board: "", campos: {} as Record<string, string> };
const C = { board: "", campos: {} as Record<string, string> };
const P = { board: "", campos: {} as Record<string, string> };

const ler = async (id: string) => (await db.select().from(cards).where(eq(cards.id, id)))[0];
const erro = (p: Promise<unknown>) => p.then(() => null, (e) => e as CoreError);

beforeAll(async () => {
  const w = await criarWorkspace();
  actor = w.actor;
  userId = w.user.id;
  F.board = (await criarBoard(w.ws.id, "fornecedores")).id;
  F.campos.nome = await criarCampo(F.board, { slug: "nome", type: "text", name: "Nome" });
  F.campos.cidade = await criarCampo(F.board, { slug: "cidade", type: "text", name: "Cidade" });
  await definirTitulo(F.board, F.campos.nome);
  // Regra na origem: a cidade "TRAVADA" não pode ser editada
  await criarRegra({ boardId: F.board, kind: "can_edit", fieldId: F.campos.cidade, expr: 'card.cidade != "TRAVADA"', message: "Cidade travada no cadastro." });

  C.board = (await criarBoard(w.ws.id, "contratos")).id;
  P.board = (await criarBoard(w.ws.id, "parcelas")).id;
  C.campos.fornecedor = await criarCampo(C.board, { slug: "fornecedor", type: "relation", config: { relation: { target_board: F.board, cardinality: "one" } } });
  C.campos.parcelas = await criarCampo(C.board, { slug: "parcelas", type: "relation", config: { relation: { target_board: P.board, cardinality: "many", inverse_name: "contrato" } } });
  C.campos.nome_forn = await criarCampo(C.board, { slug: "nome_forn", type: "lookup", name: "Nome do fornecedor", config: { lookup: { via_field: C.campos.fornecedor, path: "nome", mode: "ref", editable_writeback: true } } });
  C.campos.cidade_forn = await criarCampo(C.board, { slug: "cidade_forn", type: "lookup", name: "Cidade do fornecedor", config: { lookup: { via_field: C.campos.fornecedor, path: "cidade", mode: "ref", editable_writeback: true } } });
  C.campos.nome_fixo = await criarCampo(C.board, { slug: "nome_fixo", type: "lookup", config: { lookup: { via_field: C.campos.fornecedor, path: "nome", mode: "ref" } } });
  // Parcela espelha a relação "fornecedor" do contrato (lookup de relação), editável
  P.campos.fornecedor_ct = await criarCampo(P.board, { slug: "fornecedor_ct", type: "lookup", name: "Fornecedor do contrato", config: { lookup: { via_field: C.campos.parcelas, path: "fornecedor", mode: "ref", editable_writeback: true } } });
});

describe("espelho editável (writeback)", () => {
  it("grava no card de origem e propaga para todos os espelhos; evento na origem com o ator e via card", async () => {
    const f = await createCard({ boardId: F.board, props: { nome: "Beta", cidade: "Recife" }, actor });
    const k1 = await createCard({ boardId: C.board, props: { fornecedor: [f.id] }, actor });
    const k2 = await createCard({ boardId: C.board, props: { fornecedor: [f.id] }, actor });

    await updateFields({ cardId: k1.id, props: { nome_forn: "Beta Engenharia" }, actor });
    expect((await ler(f.id)).props[F.campos.nome]).toBe("Beta Engenharia");
    expect((await ler(f.id)).title).toBe("Beta Engenharia");
    for (const k of [k1, k2]) {
      expect((await ler(k.id)).computed[C.campos.nome_forn]).toBe("Beta Engenharia");
      expect((await ler(k.id)).computed[C.campos.nome_fixo]).toBe("Beta Engenharia");
    }
    const [ev] = await db.select().from(events).where(and(eq(events.cardId, f.id), eq(events.type, "card.field_updated")));
    expect(ev.actorId).toBe(userId);
    expect(ev.data).toMatchObject({ field_id: F.campos.nome, new: "Beta Engenharia", via_card_id: k1.id, via_field_id: C.campos.nome_forn });
    // No espelho, só o recálculo (computed), sem escrita em props
    expect(k1.id in (await ler(k1.id)).props).toBe(false);
  });

  it("espelho de relação: editar na parcela troca a relação do contrato e atualiza as outras parcelas", async () => {
    const f1 = await createCard({ boardId: F.board, props: { nome: "Gama" }, actor });
    const f2 = await createCard({ boardId: F.board, props: { nome: "Delta" }, actor });
    const k = await createCard({ boardId: C.board, props: { fornecedor: [f1.id] }, actor });
    const p1 = await createCard({ boardId: P.board, props: {}, actor });
    const p2 = await createCard({ boardId: P.board, props: {}, actor });
    await linkCards({ fieldId: "parcelas", fromCardId: k.id, toCardId: p1.id, actor });
    await linkCards({ fieldId: "parcelas", fromCardId: k.id, toCardId: p2.id, actor });
    expect((await ler(p1.id)).computed[P.campos.fornecedor_ct]).toEqual([f1.id]);

    await updateFields({ cardId: p1.id, props: { fornecedor_ct: [f2.id] }, actor });
    expect((await ler(k.id)).computed[C.campos.nome_forn]).toBe("Delta");
    for (const p of [p1, p2]) expect((await ler(p.id)).computed[P.campos.fornecedor_ct]).toEqual([f2.id]);
  });

  it("bloqueia quando a origem não pode ser editada; o estado explica o motivo", async () => {
    const f = await createCard({ boardId: F.board, props: { nome: "Épsilon", cidade: "TRAVADA" }, actor });
    const k = await createCard({ boardId: C.board, props: { fornecedor: [f.id] }, actor });
    const e = await erro(updateFields({ cardId: k.id, props: { cidade_forn: "Natal" }, actor }));
    expect(e?.message).toBe("Cidade travada no cadastro.");
    expect((await ler(f.id)).props[F.campos.cidade]).toBe("TRAVADA");

    const est = await estadoDosCampos({ cardId: k.id, actor });
    expect(est[C.campos.cidade_forn]).toMatchObject({ editavel: false, calculado: false, motivo: "Não pode ser editado no card de origem: Cidade travada no cadastro." });
    expect(est[C.campos.nome_forn]).toMatchObject({ editavel: true, espelho: { cardId: f.id, campo: { id: F.campos.nome, type: "text" } } });
    // Espelho sem writeback continua somente leitura
    expect(est[C.campos.nome_fixo]).toMatchObject({ editavel: false, calculado: true });
    expect((await erro(updateFields({ cardId: k.id, props: { nome_fixo: "x" }, actor })))?.codigo).toBe("somente_leitura");

    // Sem card de origem ligado
    const solto = await createCard({ boardId: C.board, props: {}, actor });
    expect((await estadoDosCampos({ cardId: solto.id, actor }))[C.campos.nome_forn]).toMatchObject({ editavel: false, motivo: expect.stringMatching(/Sem card de origem/) });
    expect((await erro(updateFields({ cardId: solto.id, props: { nome_forn: "x" }, actor })))?.message).toMatch(/sem card de origem/);
  });

  it("sem loop: espelho cuja origem é outro espelho é somente leitura (não há cadeia, logo não há ciclo)", async () => {
    const w = await criarWorkspace();
    const x = (await criarBoard(w.ws.id, "x")).id;
    const y = (await criarBoard(w.ws.id, "y")).id;
    const rel = await criarCampo(x, { slug: "rel", type: "relation", config: { relation: { target_board: y, cardinality: "one", inverse_name: "volta" } } });
    const cx = await criarCampo(x, { slug: "cx", type: "lookup", config: { lookup: { via_field: rel, path: "cy", mode: "ref", editable_writeback: true } } });
    await criarCampo(y, { slug: "cy", type: "lookup", config: { lookup: { via_field: rel, path: "cx", mode: "ref", editable_writeback: true } } });
    const b = await createCard({ boardId: y, props: {}, actor: w.actor });
    const a = await createCard({ boardId: x, props: { rel: [b.id] }, actor: w.actor });
    const e = await erro(updateFields({ cardId: a.id, props: { cx: "v" }, actor: w.actor }));
    // A origem (cy) é um lookup: calculado, não editável — a escrita é recusada antes de qualquer recursão
    expect(e?.codigo).toBe("somente_leitura");
    expect(cx).toBeTruthy();
  });

  it("sem loop: a propagação origem → espelhos não dispara nova escrita na origem", async () => {
    const f = await createCard({ boardId: F.board, props: { nome: "Zeta" }, actor });
    const k = await createCard({ boardId: C.board, props: { fornecedor: [f.id] }, actor });
    await updateFields({ cardId: k.id, props: { nome_forn: "Zeta 2" }, actor });
    const evs = await db.select().from(events).where(and(eq(events.cardId, f.id), eq(events.type, "card.field_updated")));
    expect(evs).toHaveLength(1);
  });
});
