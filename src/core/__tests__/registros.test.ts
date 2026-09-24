// Registros vistos pelas expressões: itens de filhos()/pais()/cartoes() expõem id, titulo, fase,
// fase_id e status, além dos campos. Campo com o mesmo slug de um metadado tem precedência.
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { cards } from "../../db/schema";
import { createCard, linkCards, moveCard } from "../cards";
import { CoreError, type Actor } from "../types";
import { criarBoard, criarCampo, criarRegra, criarWorkspace, definirTitulo } from "./fixtures";

let actor: Actor;
const C = { board: "", fases: {} as Record<string, string>, campos: {} as Record<string, string> };
const P = { board: "", fases: {} as Record<string, string>, campos: {} as Record<string, string> };

const computed = async (id: string, campo: string) => (await db.select().from(cards).where(eq(cards.id, id)))[0].computed[campo];

beforeAll(async () => {
  const w = await criarWorkspace();
  actor = w.actor;
  const c = await criarBoard(w.ws.id, "contratos", [{ name: "elaboracao" }, { name: "vigente" }]);
  const p = await criarBoard(w.ws.id, "parcelas", [{ name: "aberta" }, { name: "paga", terminal: true }]);
  Object.assign(C, { board: c.id, fases: c.fases });
  Object.assign(P, { board: p.id, fases: p.fases });
  C.campos.nome = await criarCampo(C.board, { slug: "nome", type: "text" });
  await definirTitulo(C.board, C.campos.nome);
  P.campos.rotulo = await criarCampo(P.board, { slug: "rotulo", type: "text" });
  await definirTitulo(P.board, P.campos.rotulo);
  C.campos.parcelas = await criarCampo(C.board, { slug: "parcelas", type: "relation", config: { relation: { target_board: P.board, cardinality: "many", inverse_name: "contrato" } } });
  C.campos.resumo = await criarCampo(C.board, {
    slug: "resumo",
    type: "dynamic_text",
    config: { dynamic_text: { template: '{filhos("parcelas").map(p, p.titulo + ":" + p.fase + ":" + p.status + ":" + p.fase_id)}' } },
  });
  C.campos.pagas = await criarCampo(C.board, {
    slug: "pagas",
    type: "dynamic_text",
    config: { dynamic_text: { template: '{cartoes("parcelas").filter(x, x.fase == "paga").map(x, x.titulo)}' } },
  });
  P.campos.ctr = await criarCampo(P.board, {
    slug: "ctr",
    type: "dynamic_text",
    config: { dynamic_text: { template: '{pais("contrato").map(k, k.id + ":" + k.titulo + ":" + k.fase + ":" + string(k.titulo.startsWith("CT-")))}' } },
  });
  await criarRegra({
    boardId: C.board,
    kind: "can_leave",
    phaseId: C.fases.elaboracao,
    expr: 'filhos("parcelas").todos(p, p.fase == "paga") && !filhos("parcelas").algum(p, p.status == "open")',
    message: "Todas as parcelas precisam estar pagas.",
  });
});

describe("metadados dos cards ligados", () => {
  it("filhos(), pais() e cartoes() expõem titulo, fase, fase_id, status e id; mudanças no filho propagam", async () => {
    const k = await createCard({ boardId: C.board, props: { nome: "CT-7" }, actor });
    const p1 = await createCard({ boardId: P.board, props: { rotulo: "P1" }, actor });
    await linkCards({ fieldId: "parcelas", fromCardId: k.id, toCardId: p1.id, actor });

    expect(await computed(k.id, C.campos.resumo)).toBe(`P1:aberta:open:${P.fases.aberta}`);
    expect(await computed(p1.id, P.campos.ctr)).toBe(`${k.id}:CT-7:elaboracao:true`);
    expect(await computed(k.id, C.campos.pagas)).toBe("");

    // Regra sobre fase/status dos filhos
    const x = await moveCard({ cardId: k.id, toPhaseId: C.fases.vigente, actor }).catch((e) => e);
    expect(x).toBeInstanceOf(CoreError);
    expect((x as CoreError).message).toBe("Todas as parcelas precisam estar pagas.");

    // Filho muda de fase (terminal → status done): pai recalcula e a regra passa
    await moveCard({ cardId: p1.id, toPhaseId: P.fases.paga, actor });
    expect(await computed(k.id, C.campos.resumo)).toBe(`P1:paga:done:${P.fases.paga}`);
    await moveCard({ cardId: k.id, toPhaseId: C.fases.vigente, actor });
    // O filho vê a nova fase do pai (recalcula ao mudar o pai)
    expect(await computed(p1.id, P.campos.ctr)).toBe(`${k.id}:CT-7:vigente:true`);
  });

  it("cartoes() também traz os metadados", async () => {
    const k = await createCard({ boardId: C.board, props: { nome: "CT-8" }, actor });
    const p = await createCard({ boardId: P.board, props: { rotulo: "Avulsa" }, actor });
    await moveCard({ cardId: p.id, toPhaseId: P.fases.paga, actor });
    await linkCards({ fieldId: "parcelas", fromCardId: k.id, toCardId: p.id, actor });
    expect(String(await computed(k.id, C.campos.pagas))).toContain("Avulsa");
  });

  it("campo com o mesmo slug de um metadado tem precedência", async () => {
    const w = await criarWorkspace();
    const a = await criarBoard(w.ws.id, "a");
    const b = await criarBoard(w.ws.id, "b", [{ name: "unica" }]);
    await criarCampo(b.id, { slug: "status", type: "text" });
    await criarCampo(a.id, { slug: "itens", type: "relation", config: { relation: { target_board: b.id, cardinality: "many" } } });
    const t = await criarCampo(a.id, { slug: "t", type: "dynamic_text", config: { dynamic_text: { template: '{filhos("itens").map(i, i.status + "/" + i.fase)}' } } });
    const ca = await createCard({ boardId: a.id, props: {}, actor: w.actor });
    const cb = await createCard({ boardId: b.id, props: { status: "meu status" }, actor: w.actor });
    await linkCards({ fieldId: "itens", fromCardId: ca.id, toCardId: cb.id, actor: w.actor });
    expect(await computed(ca.id, t)).toBe("meu status/unica");
  });
});
