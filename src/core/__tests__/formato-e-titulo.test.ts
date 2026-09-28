// Formato (validation.regex) com a mensagem do campo, e título derivado que nunca fica vazio quando
// o card tem texto preenchido.
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { boards, cards, fields } from "../../db/schema";
import { createCard, recalcularTitulos, updateFields } from "../cards";
import { CoreError, type Actor } from "../types";
import { criarBoard, criarCampo, criarWorkspace, definirTitulo } from "./fixtures";

let actor: Actor;
let wsId: string;

beforeAll(async () => {
  const w = await criarWorkspace();
  actor = w.actor;
  wsId = w.ws.id;
});

const erro = (p: Promise<unknown>) => p.then(() => null, (e) => e as CoreError);

describe("formato (regex)", () => {
  it("regex que rejeita espaços: recusa com a mensagem configurada; aceita sem espaços", async () => {
    const b = await criarBoard(wsId, "codigos");
    const cod = await criarCampo(b.id, { slug: "codigo", type: "text", name: "Código" });
    await db.update(fields).set({ validation: { regex: "^[A-Z]+$", message: "Use só letras maiúsculas, sem espaços." } }).where(eq(fields.id, cod));

    const e = await erro(createCard({ boardId: b.id, props: { codigo: "ACME LTDA" }, actor }));
    expect(e).toBeInstanceOf(CoreError);
    expect(e!.codigo).toBe("validacao");
    expect(e!.campos).toEqual([cod]);
    expect(e!.message).toBe("campo 'Código': Use só letras maiúsculas, sem espaços.");

    const ok = await createCard({ boardId: b.id, props: { codigo: "ACME" }, actor });
    expect(ok.props[cod]).toBe("ACME");
  });

  it("regex que permite espaços aceita; sem mensagem, usa 'Formato inválido. Esperado: …'", async () => {
    const b = await criarBoard(wsId, "nomes");
    const nome = await criarCampo(b.id, { slug: "nome", type: "text", name: "Nome" });
    await db.update(fields).set({ validation: { regex: "^[A-Z ]+$", description: "letras maiúsculas" } }).where(eq(fields.id, nome));
    await createCard({ boardId: b.id, props: { nome: "ACME LTDA" }, actor });
    const e = await erro(createCard({ boardId: b.id, props: { nome: "acme" }, actor }));
    expect(e!.message).toBe("campo 'Nome': Formato inválido. Esperado: letras maiúsculas");
  });
});

describe("título derivado", () => {
  it("campo de título vazio (ex.: oculto por condição): usa o primeiro texto preenchido", async () => {
    const b = await criarBoard(wsId, "parceiros");
    const razao = await criarCampo(b.id, { slug: "razao", type: "text", visibleExpr: 'card.tipo == "PJ"' });
    await criarCampo(b.id, { slug: "tipo", type: "text" });
    await criarCampo(b.id, { slug: "nome", type: "text" });
    await definirTitulo(b.id, razao);
    const pf = await createCard({ boardId: b.id, props: { nome: "Maria Souza" }, actor });
    expect(pf.title).toBe("Maria Souza");
    const pj = await createCard({ boardId: b.id, props: { tipo: "PJ", razao: "ACME LTDA" }, actor });
    expect(pj.title).toBe("ACME LTDA");
    const vazio = await createCard({ boardId: b.id, props: {}, actor });
    expect(vazio.title).toBe("");
  });

  it("sem campo de título: primeiro texto preenchido; recalcularTitulos aplica a troca do campo de título", async () => {
    const b = await criarBoard(wsId, "fornecedores");
    const apelido = await criarCampo(b.id, { slug: "apelido", type: "text" });
    const nome = await criarCampo(b.id, { slug: "nome", type: "text" });
    const c = await createCard({ boardId: b.id, props: { nome: "Gama Engenharia" }, actor });
    expect(c.title).toBe("Gama Engenharia");
    await updateFields({ cardId: c.id, props: { apelido: "Gama" }, actor });
    expect((await db.select().from(cards).where(eq(cards.id, c.id)))[0].title).toBe("Gama");

    await db.update(boards).set({ titleFieldId: nome }).where(eq(boards.id, b.id));
    expect(await recalcularTitulos({ boardId: b.id, actor })).toBe(1);
    expect((await db.select().from(cards).where(eq(cards.id, c.id)))[0].title).toBe("Gama Engenharia");
    expect(await recalcularTitulos({ boardId: b.id, actor })).toBe(0);
    expect(apelido).toBeTruthy();
  });
});
