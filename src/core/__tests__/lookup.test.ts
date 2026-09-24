// Campo lookup (config.lookup = { via_field, path, mode }):
//   ref  → computed, recalculado quando o card ligado muda (inclusive como título do board);
//   copy → props, gravado ao criar/mudar a ligação; não acompanha mudanças no card ligado.
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { cards, events } from "../../db/schema";
import { createCard, linkCards, unlinkCards, updateFields } from "../cards";
import { CoreError, type Actor } from "../types";
import { criarBoard, criarCampo, criarWorkspace, definirTitulo } from "./fixtures";

let actor: Actor;
const F = { board: "", campos: {} as Record<string, string> };
const C = { board: "", campos: {} as Record<string, string> };
const P = { board: "", campos: {} as Record<string, string> };

const ler = async (id: string) => (await db.select().from(cards).where(eq(cards.id, id)))[0];

beforeAll(async () => {
  const w = await criarWorkspace();
  actor = w.actor;
  F.board = (await criarBoard(w.ws.id, "fornecedores")).id;
  F.campos.nome = await criarCampo(F.board, { slug: "nome", type: "text" });
  F.campos.cnpj = await criarCampo(F.board, { slug: "cnpj", type: "cnpj" });
  await definirTitulo(F.board, F.campos.nome);

  C.board = (await criarBoard(w.ws.id, "contratos", [{ name: "elaboracao" }])).id;
  P.board = (await criarBoard(w.ws.id, "parcelas")).id;
  C.campos.fornecedor = await criarCampo(C.board, { slug: "fornecedor", type: "relation", config: { relation: { target_board: F.board, cardinality: "one" } } });
  C.campos.parcelas = await criarCampo(C.board, { slug: "parcelas", type: "relation", config: { relation: { target_board: P.board, cardinality: "many", inverse_name: "contrato" } } });
  // Título do contrato = nome do fornecedor (lookup ref)
  C.campos.nome_forn = await criarCampo(C.board, { slug: "nome_forn", type: "lookup", config: { lookup: { via_field: C.campos.fornecedor, path: "nome", mode: "ref" } } });
  C.campos.cnpj_assinatura = await criarCampo(C.board, { slug: "cnpj_assinatura", type: "lookup", config: { lookup: { via_field: C.campos.fornecedor, path: "cnpj", mode: "copy" } } });
  C.campos.valores = await criarCampo(C.board, { slug: "valores", type: "lookup", config: { lookup: { via_field: C.campos.parcelas, path: "valor" } } });
  C.campos.resumo = await criarCampo(C.board, { slug: "resumo", type: "dynamic_text", config: { dynamic_text: { template: "Contrato com {nome_forn}" } } });
  await definirTitulo(C.board, C.campos.nome_forn);

  P.campos.valor = await criarCampo(P.board, { slug: "valor", type: "currency" });
  // Relação de outro board que aponta para cá: a parcela lê o título do contrato
  P.campos.do_contrato = await criarCampo(P.board, { slug: "do_contrato", type: "lookup", config: { lookup: { via_field: C.campos.parcelas, path: "titulo", mode: "ref" } } });
});

describe("lookup ref", () => {
  it("calcula ao ligar, serve de título e acompanha mudanças no card ligado", async () => {
    const f = await createCard({ boardId: F.board, props: { nome: "Beta Ltda", cnpj: "11.222.333/0001-81" }, actor });
    const k = await createCard({ boardId: C.board, props: {}, actor });
    expect((await ler(k.id)).title).toBe("");

    await linkCards({ fieldId: "fornecedor", fromCardId: k.id, toCardId: f.id, actor });
    let lido = await ler(k.id);
    expect(lido.computed[C.campos.nome_forn]).toBe("Beta Ltda");
    expect(lido.title).toBe("Beta Ltda");
    expect(lido.computed[C.campos.resumo]).toBe("Contrato com Beta Ltda");

    // Mudança no alvo propaga para quem o referencia (valor, título e texto que usa o lookup)
    await updateFields({ cardId: f.id, props: { nome: "Beta S.A." }, actor });
    lido = await ler(k.id);
    expect(lido.computed[C.campos.nome_forn]).toBe("Beta S.A.");
    expect(lido.title).toBe("Beta S.A.");
    expect(lido.computed[C.campos.resumo]).toBe("Contrato com Beta S.A.");
    const evs = await db.select().from(events).where(and(eq(events.cardId, k.id), eq(events.type, "card.field_updated")));
    expect(evs.some((e) => (e.data as { field_id: string; computed?: boolean }).field_id === C.campos.nome_forn && (e.data as { computed?: boolean }).computed)).toBe(true);

    await unlinkCards({ fieldId: "fornecedor", fromCardId: k.id, toCardId: f.id, actor });
    lido = await ler(k.id);
    expect(lido.computed[C.campos.nome_forn]).toBeNull();
    expect(lido.title).toBe("");
  });

  it("pela relação de outro board e em cascata; vários cards ligados → lista", async () => {
    const f = await createCard({ boardId: F.board, props: { nome: "Gama" }, actor });
    const k = await createCard({ boardId: C.board, props: { fornecedor: [f.id] }, actor });
    const p1 = await createCard({ boardId: P.board, props: { valor: 100 }, actor });
    const p2 = await createCard({ boardId: P.board, props: { valor: 250 }, actor });
    await linkCards({ fieldId: "parcelas", fromCardId: k.id, toCardId: p1.id, actor });
    await linkCards({ fieldId: "parcelas", fromCardId: k.id, toCardId: p2.id, actor });
    expect((await ler(p1.id)).computed[P.campos.do_contrato]).toBe("Gama");
    expect([...((await ler(k.id)).computed[C.campos.valores] as number[])].sort()).toEqual([100, 250]);

    // Fornecedor → título do contrato → lookup da parcela (duas relações de distância)
    await updateFields({ cardId: f.id, props: { nome: "Gama Engenharia" }, actor });
    expect((await ler(p2.id)).computed[P.campos.do_contrato]).toBe("Gama Engenharia");

    await updateFields({ cardId: p2.id, props: { valor: 300 }, actor });
    expect([...((await ler(k.id)).computed[C.campos.valores] as number[])].sort()).toEqual([100, 300]);
  });
});

describe("lookup copy", () => {
  it("grava em props ao ligar (inclusive na criação) e não acompanha o card ligado; muda ao trocar a ligação", async () => {
    const f1 = await createCard({ boardId: F.board, props: { nome: "Delta", cnpj: "45.723.174/0001-10" }, actor });
    const f2 = await createCard({ boardId: F.board, props: { nome: "Épsilon", cnpj: "11.222.333/0001-81" }, actor });
    const k = await createCard({ boardId: C.board, props: { fornecedor: [f1.id] }, actor });
    expect((await ler(k.id)).props[C.campos.cnpj_assinatura]).toBe("45723174000110");
    expect((await ler(k.id)).computed[C.campos.cnpj_assinatura]).toBeUndefined();

    // Alvo muda: a cópia fica como estava
    await updateFields({ cardId: f1.id, props: { cnpj: "11.444.777/0001-61" }, actor });
    expect((await ler(k.id)).props[C.campos.cnpj_assinatura]).toBe("45723174000110");

    // Troca da ligação: nova cópia
    await updateFields({ cardId: k.id, props: { fornecedor: [f2.id] }, actor });
    expect((await ler(k.id)).props[C.campos.cnpj_assinatura]).toBe("11222333000181");
    const evs = await db.select().from(events).where(and(eq(events.cardId, k.id), eq(events.type, "card.field_updated")));
    expect(evs.some((e) => (e.data as { copia?: boolean }).copia)).toBe(true);

    await unlinkCards({ fieldId: "fornecedor", fromCardId: k.id, toCardId: f2.id, actor });
    expect(C.campos.cnpj_assinatura in (await ler(k.id)).props).toBe(false);
  });

  it("lookup é somente leitura para escrita direta", async () => {
    const k = await createCard({ boardId: C.board, props: {}, actor });
    const e = await updateFields({ cardId: k.id, props: { cnpj_assinatura: "x" }, actor }).catch((x) => x);
    expect(e).toBeInstanceOf(CoreError);
    expect((e as CoreError).codigo).toBe("somente_leitura");
  });
});
