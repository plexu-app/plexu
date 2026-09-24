// Invariante: campo oculto (por fill_phases ou visible_expr) nunca é exigido — nem na criação,
// nem ao mover, nem no estado mostrado ao usuário.
import { beforeAll, describe, expect, it } from "vitest";
import { createCard, moveCard, updateFields } from "../cards";
import { CoreError, type Actor } from "../types";
import { estadoDosCampos } from "../vistas";
import { ajustarFase, criarBoard, criarCampo, criarWorkspace } from "./fixtures";

let actor: Actor;
const B = { board: "", fases: {} as Record<string, string>, campos: {} as Record<string, string> };

beforeAll(async () => {
  const w = await criarWorkspace();
  actor = w.actor;
  const b = await criarBoard(w.ws.id, "pedidos", [{ name: "fase1" }, { name: "fase2" }, { name: "fase3", terminal: true }]);
  B.board = b.id;
  B.fases = b.fases;
  const f = B.fases;
  B.campos.titulo = await criarCampo(b.id, { slug: "titulo", type: "text" });
  // Obrigatório sempre, mas preenchido só na fase 2
  B.campos.aprovador = await criarCampo(b.id, { slug: "aprovador", type: "text", name: "Aprovador", requiredExpr: "true", config: { fill_phases: [f.fase2] } });
  // Marcado obrigatório na fase 1 por exceção, mas a fase 1 não está em fill_phases
  B.campos.nota = await criarCampo(b.id, { slug: "nota", type: "text", name: "Nota", config: { fill_phases: [f.fase2] } });
  await ajustarFase(B.campos.nota, f.fase1, { required: true });
  // Obrigatório, mas oculto por expressão enquanto urgente != true
  B.campos.urgente = await criarCampo(b.id, { slug: "urgente", type: "boolean" });
  B.campos.motivo = await criarCampo(b.id, { slug: "motivo", type: "text", name: "Motivo", requiredExpr: "true", visibleExpr: "card.urgente == true" });
});

describe("campo oculto nunca é exigido", () => {
  it("obrigatório na fase 1 sem estar em fill_phases da fase 1: criação passa sem o campo", async () => {
    const c = await createCard({ boardId: B.board, props: { titulo: "Cadeiras" }, actor });
    expect(c.phaseId).toBe(B.fases.fase1);
    const e = await estadoDosCampos({ cardId: c.id, actor });
    for (const k of ["aprovador", "nota", "motivo"]) expect(e[B.campos[k]]).toMatchObject({ visivel: false, obrigatorio: false });
  });

  it("oculto por visible_expr: não exige; quando aparece, passa a exigir", async () => {
    const c = await createCard({ boardId: B.board, props: { titulo: "Mesas" }, actor });
    const x = await createCard({ boardId: B.board, props: { titulo: "Urgente", urgente: true }, actor }).catch((err) => err);
    expect(x).toBeInstanceOf(CoreError);
    expect((x as CoreError).campos).toEqual([B.campos.motivo]);
    expect((await estadoDosCampos({ cardId: c.id, actor }))[B.campos.motivo].obrigatorio).toBe(false);
  });

  it("na fase em que aparece, o obrigatório vale para sair", async () => {
    const c = await createCard({ boardId: B.board, props: { titulo: "Lousas" }, actor });
    await moveCard({ cardId: c.id, toPhaseId: B.fases.fase2, actor });
    const e = await estadoDosCampos({ cardId: c.id, actor });
    expect(e[B.campos.aprovador]).toMatchObject({ visivel: true, obrigatorio: true });
    const x = await moveCard({ cardId: c.id, toPhaseId: B.fases.fase3, actor }).catch((err) => err);
    expect((x as CoreError).campos).toEqual([B.campos.aprovador]);
    await updateFields({ cardId: c.id, props: { aprovador: "Ana" }, actor });
    await moveCard({ cardId: c.id, toPhaseId: B.fases.fase3, actor });
  });
});
