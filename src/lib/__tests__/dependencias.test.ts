import { describe, expect, it } from "vitest";
import { dependenciasDosCampos, menciona } from "../dependencias";

const campo = (id: string, slug: string, extra: object = {}) => ({
  id,
  slug,
  name: slug.toUpperCase(),
  type: "text",
  config: {},
  visibleExpr: null,
  requiredExpr: null,
  defaultValueExpr: null,
  ...extra,
});

describe("dependências do campo", () => {
  it("menciona: card.<slug> inteiro, {slug} de modelo e id", () => {
    const f = { id: "f-1", slug: "valor" };
    expect([menciona("card.valor > 0", f), menciona("card.valor_total > 0", f), menciona("{valor} reais", f), menciona('{"fields":["f-1"]}', f), menciona(null, f)]).toEqual([
      true,
      false,
      true,
      true,
      false,
    ]);
  });

  it("acha regras, automações, condicionais, expressões, calculados, relações e o cartão", () => {
    const campos = [
      campo("id-valor", "valor"),
      campo("id-total", "total", { type: "rollup", config: { rollup: { via_field: "id-itens", expr: "valor" } } }),
      campo("id-janela", "janela", { requiredExpr: "card.valor > 10" }),
      campo("id-itens", "itens", { type: "relation", config: { relation: { lock_fields_while_linked: ["id-valor"] } } }),
    ];
    const deps = dependenciasDosCampos(campos, {
      regras: [{ kind: "can_enter", expr: "card.valor > 0", fieldId: null, message: "Precisa de valor" }],
      automacoes: [{ nome: "Avisar", trigger: { type: "field_updated", fields: ["id-valor"] }, condicao: null, steps: [] }],
      condicionais: [{ id: "c", nome: "Grande", condicao: "card.valor > 1000", seVerdadeiro: [{ acao: "exibir", campos: ["id-janela"] }], seFalso: [] }],
      kanban: { campos: ["id-valor"], prazo: null },
    });
    expect(deps["id-valor"].map((d) => d.tipo)).toEqual(["regra", "automacao", "condicional", "expressao", "relacao", "cartao"]);
    expect(deps["id-valor"].find((d) => d.tipo === "condicional")?.nome).toBe("Condicional: Grande (na condição)");
    expect(deps["id-janela"].map((d) => d.nome)).toEqual(["Condicional: Grande"]);
    expect(deps["id-itens"].map((d) => d.nome)).toEqual(["Campo calculado TOTAL"]);
  });
});
