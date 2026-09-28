import { describe, expect, it } from "vitest";
import { mensagemFormato, normalizarValidacao, validarFormato } from "../validacao";

const semEspacos = { type: "text", validation: { regex: "^[A-Z]+$", message: "Só letras maiúsculas, sem espaços." } };

describe("validarFormato", () => {
  it("regex que rejeita espaços: mostra a mensagem configurada", () => {
    expect(validarFormato(semEspacos, "ACME LTDA")).toBe("Só letras maiúsculas, sem espaços.");
    expect(validarFormato(semEspacos, "ACME")).toBeNull();
  });

  it("regex que permite espaços aceita texto com espaços", () => {
    expect(validarFormato({ type: "text", validation: { regex: "^[A-Z ]+$" } }, "ACME LTDA")).toBeNull();
  });

  it("sem message: 'Formato inválido. Esperado: …' com a descrição ou o regex", () => {
    expect(validarFormato({ type: "text", validation: { regex: "^\d+$", description: "somente números" } }, "12a")).toBe("Formato inválido. Esperado: somente números");
    expect(mensagemFormato({ regex: "^\d+$" })).toBe("Formato inválido. Esperado: texto que corresponda a ^\d+$");
  });

  it("vazio, tipos não texto e regex quebrado não geram erro de formato", () => {
    expect(validarFormato(semEspacos, "")).toBeNull();
    expect(validarFormato({ type: "number", validation: { regex: "^[A-Z]+$" } }, "1 2")).toBeNull();
    expect(validarFormato({ type: "text", validation: { regex: "([" } }, "x")).toBeNull();
  });
});

describe("normalizarValidacao", () => {
  it("guarda só o que foi informado e recusa regex inválido", () => {
    expect(normalizarValidacao({ regex: " ^[A-Z]+$ ", message: " Maiúsculas ", description: "" })).toEqual({ regex: "^[A-Z]+$", message: "Maiúsculas" });
    expect(normalizarValidacao({})).toBeNull();
    expect(() => normalizarValidacao({ regex: "([" })).toThrow(/regex/);
  });
});
