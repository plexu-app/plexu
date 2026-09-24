// Fase de origem (fields.config.origin_phase_id): antes = oculto; na origem = editável; depois =
// somente leitura. field_phase_settings vence, atributo por atributo. Sem origem = como sempre.
import { beforeAll, describe, expect, it } from "vitest";
import { createCard, moveCard, updateFields } from "../cards";
import { CoreError, type Actor } from "../types";
import { estadoDosCampos } from "../vistas";
import { ajustarFase, criarBoard, criarCampo, criarWorkspace } from "./fixtures";

let actor: Actor;
const B = { board: "", fases: {} as Record<string, string>, campos: {} as Record<string, string> };

async function erro(p: Promise<unknown>): Promise<CoreError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof CoreError) return e;
    throw e;
  }
  throw new Error("esperava CoreError, operação passou");
}

beforeAll(async () => {
  const w = await criarWorkspace();
  actor = w.actor;
  const b = await criarBoard(w.ws.id, "pedidos", [{ name: "abertura" }, { name: "cotacao" }, { name: "entrega", terminal: true }]);
  B.board = b.id;
  B.fases = b.fases;
  const f = B.fases;
  B.campos.titulo = await criarCampo(b.id, { slug: "titulo", type: "text", name: "Título" });
  B.campos.valor = await criarCampo(b.id, { slug: "valor", type: "currency", name: "Valor", requiredExpr: "true", config: { origin_phase_id: f.cotacao } });
  B.campos.nota = await criarCampo(b.id, { slug: "nota", type: "text", name: "Nota", config: { origin_phase_id: f.cotacao } });
  B.campos.resumo = await criarCampo(b.id, {
    slug: "resumo",
    type: "dynamic_text",
    name: "Resumo",
    config: { origin_phase_id: f.entrega, dynamic_text: { template: "{titulo}: {valor}" } },
  });
  // Override: a nota continua editável na entrega; o título (sem origem) fica oculto na cotação.
  await ajustarFase(B.campos.nota, f.entrega, { editable: true });
  await ajustarFase(B.campos.titulo, f.cotacao, { visible: false });
});

describe("fase de origem", () => {
  it("antes da origem: oculto e não editável; obrigatório da origem não vale na criação da fase anterior", async () => {
    const c = await createCard({ boardId: B.board, props: { titulo: "Cadeiras" }, actor });
    const e = await estadoDosCampos({ cardId: c.id, actor });
    expect(e[B.campos.valor]).toMatchObject({ visivel: false, editavel: false, obrigatorio: false });
    expect(e[B.campos.resumo].visivel).toBe(false);
    expect(e[B.campos.titulo]).toMatchObject({ visivel: true, editavel: true });

    const x = await erro(updateFields({ cardId: c.id, props: { valor: 10 }, actor }));
    expect(x.codigo).toBe("somente_leitura");
    expect(x.campos).toEqual([B.campos.valor]);
  });

  it("criar direto na fase de origem exige o obrigatório dela", async () => {
    const x = await erro(createCard({ boardId: B.board, phaseId: B.fases.cotacao, props: { titulo: "Mesas" }, actor }));
    expect(x.codigo).toBe("obrigatorio");
    expect(x.campos).toEqual([B.campos.valor]);
  });

  it("na origem: editável e obrigatório para sair; depois: somente leitura, com override por fase", async () => {
    const c = await createCard({ boardId: B.board, props: { titulo: "Lousas" }, actor });
    await moveCard({ cardId: c.id, toPhaseId: B.fases.cotacao, actor });
    let e = await estadoDosCampos({ cardId: c.id, actor });
    expect(e[B.campos.valor]).toMatchObject({ visivel: true, editavel: true, obrigatorio: true });
    expect(e[B.campos.titulo].visivel).toBe(false); // override explícito vence (campo sem origem)

    const x = await erro(moveCard({ cardId: c.id, toPhaseId: B.fases.entrega, actor }));
    expect(x.codigo).toBe("obrigatorio");
    await updateFields({ cardId: c.id, props: { valor: 1500, nota: "cotado" }, actor });
    await moveCard({ cardId: c.id, toPhaseId: B.fases.entrega, actor });

    e = await estadoDosCampos({ cardId: c.id, actor });
    expect(e[B.campos.valor]).toMatchObject({ visivel: true, editavel: false });
    expect(e[B.campos.nota]).toMatchObject({ visivel: true, editavel: true });
    expect(e[B.campos.resumo]).toMatchObject({ visivel: true, calculado: true });
    expect(e[B.campos.titulo]).toMatchObject({ visivel: true, editavel: true });

    expect((await erro(updateFields({ cardId: c.id, props: { valor: 1 }, actor }))).codigo).toBe("somente_leitura");
    const ok = await updateFields({ cardId: c.id, props: { nota: "entregue" }, actor });
    expect(ok.props[B.campos.nota]).toBe("entregue");
  });
});
