import { describe, expect, it } from "vitest";
import { destinosVisiveis, type Movimento } from "../movimentos";

const m = (faseId: string, extra: Partial<Movimento> = {}): Movimento => ({ faseId, permitido: true, volta: false, anterior: false, ...extra });

describe("destinos do mover card", () => {
  it("à frente: permitidos e travados por obrigatório; recusados por regra somem", () => {
    const { frente } = destinosVisiveis([
      m("a"),
      m("b", { permitido: false, motivo: "Todos os itens precisam estar separados" }),
      m("c", { permitido: false, obrigatorios: true, motivo: "Preencha Valor" }),
    ]);
    expect(frente.map((x) => x.faseId)).toEqual(["a", "c"]);
  });

  it("o motivo aparece uma vez só, na primeira pill que o tem", () => {
    const { frente } = destinosVisiveis([
      m("a", { permitido: false, obrigatorios: true, motivo: "Preencha Valor" }),
      m("b", { permitido: false, obrigatorios: true, motivo: "Preencha Valor" }),
      m("c", { permitido: false, obrigatorios: true, motivo: "Preencha Prazo" }),
    ]);
    expect(frente.map((x) => x.motivoVisivel)).toEqual(["Preencha Valor", null, "Preencha Prazo"]);
  });

  it("para trás: só a fase imediatamente anterior, e só se permitida", () => {
    expect(destinosVisiveis([m("x", { volta: true }), m("y", { volta: true, anterior: true })]).anterior?.faseId).toBe("y");
    expect(destinosVisiveis([m("y", { volta: true, anterior: true, permitido: false, motivo: "não volta" })]).anterior).toBeNull();
  });
});
