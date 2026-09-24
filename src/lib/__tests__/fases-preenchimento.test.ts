import { describe, expect, it } from "vitest";
import { ajusteEfetivo, combinarAjuste, fasesDoCampo, obrigatorioOculto, padraoDasFases, primeiraFase } from "../fases-preenchimento";

const fases = [
  { id: "a", position: 0 },
  { id: "b", position: 1 },
  { id: "c", position: 2 },
  { id: "d", position: 3 },
];
const LEITURA = { visible: null, editable: false, required: null };
const OCULTO = { visible: false, editable: false, required: false };

describe("fases de preenchimento", () => {
  it("lê fill_phases da config, sem repetir nem aceitar lixo", () => {
    expect(fasesDoCampo({ fill_phases: ["b", "b", "", 3, "d"] })).toEqual(["b", "d"]);
    expect(fasesDoCampo({})).toEqual([]);
    expect(primeiraFase({ fill_phases: ["d", "b"] }, fases)?.id).toBe("b");
  });

  it("oculto antes da primeira, editável nas listadas, leitura nas outras", () => {
    const cfg = { fill_phases: ["b", "d"] };
    expect(padraoDasFases(cfg, fases, "a")).toEqual(OCULTO);
    expect(padraoDasFases(cfg, fases, "b")).toBeUndefined();
    expect(padraoDasFases(cfg, fases, "c")).toEqual(LEITURA);
    expect(padraoDasFases(cfg, fases, "d")).toBeUndefined();
  });

  it("editable_everywhere: editável em toda fase a partir da primeira", () => {
    const cfg = { fill_phases: ["b"], editable_everywhere: true };
    expect(padraoDasFases(cfg, fases, "a")).toEqual(OCULTO);
    expect(padraoDasFases(cfg, fases, "c")).toBeUndefined();
    expect(padraoDasFases(cfg, fases, "d")).toBeUndefined();
  });

  it("sem fases, sem fase atual ou só com fases inexistentes: não se aplica", () => {
    expect(padraoDasFases({}, fases, "a")).toBeUndefined();
    expect(padraoDasFases({ fill_phases: ["b"] }, fases, null)).toBeUndefined();
    expect(padraoDasFases({ fill_phases: ["x"] }, fases, "a")).toBeUndefined();
  });

  it("override explícito vence atributo por atributo", () => {
    expect(combinarAjuste({ visible: null, editable: true, required: null }, LEITURA)).toEqual({ visible: null, editable: true, required: null });
    expect(ajusteEfetivo({ fill_phases: ["c"] }, fases, "a", { visible: true, editable: null, required: null })).toEqual({
      visible: true,
      editable: false,
      required: false,
    });
    const aj = { visible: false, editable: null, required: null };
    expect(ajusteEfetivo({}, fases, "a", aj)).toBe(aj);
  });
});

describe("obrigatorioOculto (aviso em Settings → Campos)", () => {
  const nomes = fases.map((f) => ({ id: f.id, name: f.id.toUpperCase() }));
  const aj = (phaseId: string, required: boolean) => ({ fieldId: "x", phaseId, visible: null, editable: null, required });
  it("avisa quando a exceção exige o campo numa fase em que ele está oculto", () => {
    const campo = { id: "x", config: { fill_phases: ["c"] }, requiredExpr: null, visibleExpr: null };
    expect(obrigatorioOculto(nomes, [aj("a", true), aj("c", true)], campo)).toEqual(["A"]);
  });
  it("não avisa o caso normal: required \"true\" com fill_phases (antes da fase fica oculto e não exigido)", () => {
    const campo = { id: "x", config: { fill_phases: ["c"] }, requiredExpr: "true", visibleExpr: null };
    expect(obrigatorioOculto(nomes, [], campo)).toEqual([]);
  });
  it("visible \"false\" com required: oculto em todas as fases", () => {
    expect(obrigatorioOculto(nomes, [], { id: "x", config: {}, requiredExpr: "true", visibleExpr: "false" })).toEqual(["todas as fases"]);
  });
});
