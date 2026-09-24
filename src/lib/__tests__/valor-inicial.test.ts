import { describe, expect, it } from "vitest";
import { exprDoValorFixo, lerValorInicial } from "../valor-inicial";

describe("valor inicial", () => {
  it("lê expressões simples como modos da UI", () => {
    expect(lerValorInicial("date", "")).toEqual({ modo: "nenhum", fixo: "" });
    expect(lerValorInicial("date", "hoje()")).toEqual({ modo: "hoje", fixo: "" });
    expect(lerValorInicial("select", '"servico"')).toEqual({ modo: "fixo", fixo: "servico" });
    expect(lerValorInicial("currency", "1500.5")).toEqual({ modo: "fixo", fixo: "1500.5" });
    expect(lerValorInicial("boolean", "true")).toEqual({ modo: "fixo", fixo: "true" });
    expect(lerValorInicial("text", "card.a + 1").modo).toBe("avancado");
    expect(lerValorInicial("text", "hoje()").modo).toBe("avancado");
  });

  it("gera CEL a partir do valor fixo", () => {
    expect(exprDoValorFixo("text", 'A "definir"')).toBe('"A \\"definir\\""');
    expect(exprDoValorFixo("currency", "1.000,50")).toBe("1000.5");
    expect(exprDoValorFixo("number", "12.5")).toBe("12.5");
    expect(exprDoValorFixo("number", "abc")).toBe("");
    expect(exprDoValorFixo("boolean", "false")).toBe("false");
    expect(exprDoValorFixo("text", "  ")).toBe("");
  });
});
