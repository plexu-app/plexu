import { describe, expect, it } from "vitest";
import { estadoCriacao, registroDoForm, valoresDoFormData, type CampoCriacaoDef } from "../campos-criacao";

const campo = (p: Partial<CampoCriacaoDef> & { id: string; type: string }): CampoCriacaoDef => ({
  name: p.id,
  slug: p.id,
  config: {},
  helpText: null,
  visibleExpr: null,
  requiredExpr: null,
  ajuste: null,
  ...p,
});

const campos = [
  campo({ id: "tipo", type: "select" }),
  campo({ id: "valor", type: "currency" }),
  campo({ id: "cnpj", type: "cnpj", visibleExpr: 'card.tipo == "compra"', requiredExpr: "card.valor > 1000" }),
  campo({ id: "urgente", type: "boolean" }),
  campo({ id: "motivo", type: "text", requiredExpr: "card.urgente == true" }),
  campo({ id: "fixo", type: "text", visibleExpr: "false", ajuste: { visible: true, editable: null, required: true } }),
];

describe("registroDoForm", () => {
  it("converte strings do formulário para os tipos vistos pelo CEL", () => {
    expect(registroDoForm(campos, { tipo: ["compra"], valor: ["1.500,50"], urgente: [], motivo: [""] })).toEqual({
      tipo: "compra",
      valor: 1500.5,
      urgente: false,
    });
  });
});

describe("estadoCriacao", () => {
  const hoje = "2026-09-24";
  it("visível e obrigatório seguem os valores digitados", () => {
    let e = estadoCriacao(campos, registroDoForm(campos, { tipo: ["servico"] }), "Elaboração", hoje);
    expect(e.cnpj).toEqual({ visivel: false, obrigatorio: false });
    expect(e.motivo.obrigatorio).toBe(false);

    e = estadoCriacao(campos, registroDoForm(campos, { tipo: ["compra"], valor: ["2000"], urgente: ["on"] }), "Elaboração", hoje);
    expect(e.cnpj).toEqual({ visivel: true, obrigatorio: true });
    expect(e.motivo.obrigatorio).toBe(true);
  });

  it("ajuste da fase vence a expressão; erro de avaliação cai no padrão", () => {
    const e = estadoCriacao([...campos, campo({ id: "quebrado", type: "text", visibleExpr: "filhos(\"x\").contar() > 0" })], {}, null, hoje);
    expect(e.fixo).toEqual({ visivel: true, obrigatorio: true });
    expect(e.quebrado.visivel).toBe(true);
  });
});

describe("valoresDoFormData", () => {
  it("agrupa entradas f:<id> e ignora o resto", () => {
    const f = new FormData();
    f.append("f:a", "1");
    f.append("f:m", "x");
    f.append("f:m", "y");
    f.append("campos", "a");
    expect(valoresDoFormData(f)).toEqual({ a: ["1"], m: ["x", "y"] });
  });
});
