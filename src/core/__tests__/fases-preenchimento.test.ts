// Fases de preenchimento (decisão 18-revisada): fields.config.fill_phases e editable_everywhere.
// Oculto antes da primeira fase listada; editável nas listadas; somente leitura nas outras (ou
// editável, com editable_everywhere). field_phase_settings vence, atributo por atributo.
import { beforeAll, describe, expect, it } from "vitest";
import { createCard, moveCard, updateFields } from "../cards";
import { CoreError, type Actor } from "../types";
import { estadoDosCampos, movimentosDoCard } from "../vistas";
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
  const b = await criarBoard(w.ws.id, "pedidos", [{ name: "abertura" }, { name: "cotacao" }, { name: "aprovacao" }, { name: "entrega", terminal: true }]);
  B.board = b.id;
  B.fases = b.fases;
  const f = B.fases;
  const c = B.campos;
  c.titulo = await criarCampo(b.id, { slug: "titulo", type: "text", name: "Título" });
  c.valor = await criarCampo(b.id, { slug: "valor", type: "currency", name: "Valor", requiredExpr: "true", config: { fill_phases: [f.cotacao] } });
  // Preenchido em duas fases não consecutivas: leitura entre elas.
  c.revisao = await criarCampo(b.id, { slug: "revisao", type: "text", name: "Revisão", config: { fill_phases: [f.entrega, f.cotacao] } });
  // Editável em qualquer fase a partir da primeira.
  c.obs = await criarCampo(b.id, { slug: "obs", type: "text", name: "Obs", config: { fill_phases: [f.cotacao], editable_everywhere: true } });
  c.nota = await criarCampo(b.id, { slug: "nota", type: "text", name: "Nota", config: { fill_phases: [f.cotacao] } });
  c.resumo = await criarCampo(b.id, {
    slug: "resumo",
    type: "dynamic_text",
    name: "Resumo",
    config: { fill_phases: [f.entrega], dynamic_text: { template: "{titulo}: {valor}" } },
  });
  c.fantasma = await criarCampo(b.id, { slug: "fantasma", type: "text", name: "Fantasma", config: { fill_phases: ["00000000-0000-0000-0000-000000000000"] } });
  // Overrides finos: a nota fica editável na aprovação; o título (sem fases) fica oculto na cotação.
  await ajustarFase(c.nota, f.aprovacao, { editable: true });
  await ajustarFase(c.titulo, f.cotacao, { visible: false });
});

const estado = async (id: string) => estadoDosCampos({ cardId: id, actor });

async function cardNa(fase: string, props: Record<string, unknown> = {}) {
  const c = await createCard({ boardId: B.board, props: { titulo: "x", ...props }, actor });
  for (const f of ["cotacao", "aprovacao", "entrega"]) {
    if (fase === "abertura") break;
    if (f === "aprovacao") await updateFields({ cardId: c.id, props: { valor: 10 }, actor });
    await moveCard({ cardId: c.id, toPhaseId: B.fases[f], actor });
    if (f === fase) break;
  }
  return c;
}

describe("visibilidade e edição por fase", () => {
  it("antes da primeira fase: oculto; sem fases ou com fase inexistente: como sempre", async () => {
    const c = await cardNa("abertura");
    const e = await estado(c.id);
    for (const k of ["valor", "revisao", "obs", "nota", "resumo"]) expect(e[B.campos[k]]).toMatchObject({ visivel: false, editavel: false, obrigatorio: false });
    expect(e[B.campos.titulo]).toMatchObject({ visivel: true, editavel: true });
    expect(e[B.campos.fantasma]).toMatchObject({ visivel: true, editavel: true });
    const x = await erro(updateFields({ cardId: c.id, props: { valor: 10 }, actor }));
    expect(x.codigo).toBe("somente_leitura");
  });

  it("nas fases listadas: editável; obrigatório vale para sair", async () => {
    const c = await cardNa("cotacao");
    const e = await estado(c.id);
    expect(e[B.campos.valor]).toMatchObject({ visivel: true, editavel: true, obrigatorio: true });
    expect(e[B.campos.revisao]).toMatchObject({ visivel: true, editavel: true });
    expect(e[B.campos.titulo].visivel).toBe(false);
    expect((await erro(moveCard({ cardId: c.id, toPhaseId: B.fases.aprovacao, actor }))).codigo).toBe("obrigatorio");
  });

  it("entre as listadas: leitura; editable_everywhere e override continuam editáveis", async () => {
    const c = await cardNa("aprovacao");
    const e = await estado(c.id);
    expect(e[B.campos.valor]).toMatchObject({ visivel: true, editavel: false });
    expect(e[B.campos.revisao]).toMatchObject({ visivel: true, editavel: false });
    expect(e[B.campos.obs]).toMatchObject({ visivel: true, editavel: true });
    expect(e[B.campos.nota]).toMatchObject({ visivel: true, editavel: true });
    expect((await erro(updateFields({ cardId: c.id, props: { revisao: "r" }, actor }))).codigo).toBe("somente_leitura");
    const ok = await updateFields({ cardId: c.id, props: { obs: "depois", nota: "ajuste" }, actor });
    expect(ok.props[B.campos.obs]).toBe("depois");
  });

  it("de novo numa fase listada: editável; calculado aparece a partir da primeira fase dele", async () => {
    const c = await cardNa("entrega");
    const e = await estado(c.id);
    expect(e[B.campos.revisao]).toMatchObject({ visivel: true, editavel: true });
    expect(e[B.campos.valor].editavel).toBe(false);
    expect(e[B.campos.nota].editavel).toBe(false);
    expect(e[B.campos.obs].editavel).toBe(true);
    expect(e[B.campos.resumo]).toMatchObject({ visivel: true, calculado: true });
    const ok = await updateFields({ cardId: c.id, props: { revisao: "final" }, actor });
    expect(ok.props[B.campos.revisao]).toBe("final");
  });

  it("criar direto numa fase exige os obrigatórios das listadas até ela", async () => {
    const x = await erro(createCard({ boardId: B.board, phaseId: B.fases.cotacao, props: { titulo: "Mesas" }, actor }));
    expect(x.codigo).toBe("obrigatorio");
    expect(x.campos).toEqual([B.campos.valor]);
  });
});

describe("movimentosDoCard", () => {
  it("lista as outras fases com permitido/motivo, sem mover", async () => {
    const c = await cardNa("cotacao");
    const ms = await movimentosDoCard({ cardId: c.id, actor });
    expect(ms.map((m) => m.faseId)).toEqual([B.fases.abertura, B.fases.aprovacao, B.fases.entrega]);
    expect(ms[0]).toEqual({ faseId: B.fases.abertura, permitido: true });
    expect(ms[1].permitido).toBe(false);
    expect(ms[1].motivo).toMatch(/Valor/);
    expect((await estado(c.id))[B.campos.valor].editavel).toBe(true);
  });
});
