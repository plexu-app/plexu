// Campo de anexo no core: ids existem, são do workspace e não estão em uso em outro card; o anexo é
// ligado ao card na escrita; obrigatoriedade = lista não vazia; excluir o card não apaga o anexo.
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { attachments } from "../../db/schema";
import { createCard, deleteCard, updateFields } from "../cards";
import { CoreError, type Actor } from "../types";
import { criarBoard, criarCampo, criarWorkspace } from "./fixtures";

let actor: Actor;
let wsId: string;
let outroWs: string;
const B = { board: "", campos: {} as Record<string, string> };

async function anexo(workspaceId: string, cardId: string | null = null) {
  const [a] = await db
    .insert(attachments)
    .values({ workspaceId, cardId, fieldId: B.campos.escopo, storageKey: "a".repeat(40), filename: "escopo.pdf", mime: "application/pdf", size: 10 })
    .returning();
  return a.id;
}
const donoDe = async (id: string) => (await db.select().from(attachments).where(eq(attachments.id, id)))[0].cardId;
const erro = (p: Promise<unknown>) => p.then(() => null, (e) => e as CoreError);

beforeAll(async () => {
  const w = await criarWorkspace();
  actor = w.actor;
  wsId = w.ws.id;
  outroWs = (await criarWorkspace()).ws.id;
  B.board = (await criarBoard(wsId, "contratos")).id;
  B.campos.objeto = await criarCampo(B.board, { slug: "objeto", type: "text" });
  B.campos.escopo = await criarCampo(B.board, { slug: "escopo", type: "attachment", name: "Escopo", requiredExpr: "true" });
});

describe("campo de anexo", () => {
  it("obrigatório = lista não vazia", async () => {
    for (const props of [{ objeto: "x" }, { objeto: "x", escopo: [] }]) {
      const e = await erro(createCard({ boardId: B.board, props, actor }));
      expect(e?.codigo).toBe("obrigatorio");
      expect(e?.campos).toEqual([B.campos.escopo]);
    }
  });

  it("anexo provisório é ligado ao card na criação; não pode ser usado em outro card", async () => {
    const a = await anexo(wsId);
    const c = await createCard({ boardId: B.board, props: { objeto: "Obra", escopo: [a, a] }, actor });
    expect(c.props[B.campos.escopo]).toEqual([a]);
    expect(await donoDe(a)).toBe(c.id);

    const e = await erro(createCard({ boardId: B.board, props: { objeto: "Outra", escopo: [a] }, actor }));
    expect(e?.codigo).toBe("validacao");
    expect(e?.message).toMatch(/em uso em outro card/);

    // O próprio card pode regravar o mesmo anexo e somar outro
    const b = await anexo(wsId);
    const u = await updateFields({ cardId: c.id, props: { escopo: [a, b] }, actor });
    expect(u.props[B.campos.escopo]).toEqual([a, b]);
    expect(await donoDe(b)).toBe(c.id);
  });

  it("recusa id inexistente, de outro workspace ou que não é uuid", async () => {
    const deFora = await anexo(outroWs);
    for (const escopo of [["00000000-0000-4000-8000-000000000000"], [deFora]]) {
      const e = await erro(createCard({ boardId: B.board, props: { objeto: "x", escopo }, actor }));
      expect(e?.message).toMatch(/anexo não encontrado/);
    }
    expect((await erro(createCard({ boardId: B.board, props: { objeto: "x", escopo: ["abc"] }, actor })))?.message).toMatch(/id de anexo inválido/);
  });

  it("excluir o card não apaga o anexo (exclusão lógica)", async () => {
    const a = await anexo(wsId);
    const c = await createCard({ boardId: B.board, props: { objeto: "Temporário", escopo: [a] }, actor });
    await deleteCard({ cardId: c.id, actor });
    const [row] = await db.select().from(attachments).where(eq(attachments.id, a));
    expect(row).toMatchObject({ id: a, cardId: c.id, filename: "escopo.pdf" });
  });
});
