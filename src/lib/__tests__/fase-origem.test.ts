import { describe, expect, it } from "vitest";
import { ajusteEfetivo, combinarAjuste, origemDoCampo, padraoDaOrigem } from "../fase-origem";

const fases = [
  { id: "a", position: 0 },
  { id: "b", position: 1 },
  { id: "c", position: 2 },
];

describe("fase de origem", () => {
  it("lê origin_phase_id da config", () => {
    expect(origemDoCampo({ origin_phase_id: "b" })).toBe("b");
    expect(origemDoCampo({ origin_phase_id: "" })).toBeNull();
    expect(origemDoCampo(null)).toBeNull();
  });

  it("antes oculto, na origem sem ajuste, depois somente leitura", () => {
    expect(padraoDaOrigem("b", fases, "a")).toEqual({ visible: false, editable: false, required: false });
    expect(padraoDaOrigem("b", fases, "b")).toBeUndefined();
    expect(padraoDaOrigem("b", fases, "c")).toEqual({ visible: null, editable: false, required: null });
  });

  it("sem origem, sem fase ou com origem fora do board: não se aplica", () => {
    expect(padraoDaOrigem(null, fases, "a")).toBeUndefined();
    expect(padraoDaOrigem("b", fases, null)).toBeUndefined();
    expect(padraoDaOrigem("x", fases, "a")).toBeUndefined();
  });

  it("override explícito vence atributo por atributo", () => {
    expect(combinarAjuste({ visible: null, editable: true, required: null }, { visible: null, editable: false, required: null })).toEqual({
      visible: null,
      editable: true,
      required: null,
    });
    expect(ajusteEfetivo({ origin_phase_id: "c" }, fases, "a", { visible: true, editable: null, required: null })).toEqual({
      visible: true,
      editable: false,
      required: false,
    });
    const aj = { visible: false, editable: null, required: null };
    expect(ajusteEfetivo({}, fases, "a", aj)).toBe(aj);
  });
});
