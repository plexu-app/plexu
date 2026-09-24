import { describe, expect, it } from "vitest";
import { ErroConfigCampo, expressoesDaConfig, normalizarConfig, type ContextoConfig } from "../config-campos";
import { colunasDaTabela, filtrarLinhas, linhasDaTabela } from "../tabela";

describe("tabela", () => {
  const campos = [
    { id: "t", name: "Título", type: "text" },
    { id: "v", name: "Valor", type: "currency" },
    { id: "r", name: "Rel", type: "relation" },
    { id: "g", name: "Global", type: "rollup" },
  ];
  const cards = [
    { id: "a1", title: "Contrato Ação", phaseId: "p1", props: { t: "Contrato Ação", v: 10 }, computed: { g: 5 } },
    { id: "b2", title: "", phaseId: null, props: { v: null }, computed: {} },
  ];

  it("colunas: sem relação nem título; fase primeiro em fluxo", () => {
    expect(colunasDaTabela(campos, "t", true).map((c) => c.id)).toEqual(["__fase", "v", "g"]);
    expect(colunasDaTabela(campos, "t", false).find((c) => c.id === "g")?.calculado).toBe(true);
  });

  it("linhas: texto formatado e valor de ordenação numérico ou nulo", () => {
    const [l1, l2] = linhasDaTabela(cards, campos, new Map([["p1", "Elaboração"]]));
    expect(l1.textos.v).toBe("R$ 10,00");
    expect(l1.ordem.v).toBe(10);
    expect(l1.ordem.g).toBe(5);
    expect(l1.fase).toBe("Elaboração");
    expect(l2.titulo).toBe("Sem título · b2");
    expect(l2.ordem.v).toBeNull();
  });

  it("filtro ignora acento e caixa, exige todas as palavras", () => {
    const linhas = linhasDaTabela(cards, campos, new Map([["p1", "Elaboração"]]));
    expect(filtrarLinhas(linhas, "acao").map((l) => l.id)).toEqual(["a1"]);
    expect(filtrarLinhas(linhas, "elaboracao 10,00")).toHaveLength(1);
    expect(filtrarLinhas(linhas, "contrato inexistente")).toHaveLength(0);
    expect(filtrarLinhas(linhas, "  ")).toHaveLength(2);
    expect(filtrarLinhas(linhas, "b2")).toHaveLength(1);
  });
});

describe("config por tipo", () => {
  const ctx: ContextoConfig = {
    boardId: "b1",
    boards: new Map([
      ["b1", "Contratos"],
      ["b2", "Parcelas"],
    ]),
    relacoes: new Map([["rel1", { boardId: "b1", target: "b2" }]]),
    campos: [
      { id: "rel1", slug: "parcelas", type: "relation" },
      { id: "t1", slug: "objeto", type: "text" },
    ],
    fases: new Set(["f1", "f2"]),
  };
  const erro = (tipo: string, config: unknown) => {
    try {
      normalizarConfig(tipo, config, ctx);
    } catch (e) {
      if (e instanceof ErroConfigCampo) return e.message;
      throw e;
    }
    return null;
  };

  it("seleção exige opções distintas", () => {
    expect(normalizarConfig("select", { options: [" A ", "B", ""] }, ctx)).toEqual({ options: ["A", "B"] });
    expect(erro("select", { options: [] })).toMatch(/ao menos uma/);
    expect(erro("multi_select", { options: ["A", "A"] })).toMatch(/repetidas/);
  });

  it("relação valida destino e normaliza flags", () => {
    expect(normalizarConfig("relation", { relation: { target_board: "b2", exclusive: true, cardinality: "x", lock_fields_while_linked: ["t1"] } }, ctx)).toEqual({
      relation: { target_board: "b2", cardinality: "many", exclusive: true, is_parent: false, lock_fields_while_linked: ["t1"] },
    });
    expect(erro("relation", { relation: { target_board: "outro" } })).toMatch(/destino/);
    expect(erro("relation", { relation: { target_board: "b2", lock_fields_while_linked: ["zz"] } })).toMatch(/travado/);
  });

  it("sequence exige {n}, escopo válido e pai quando escopo = pai", () => {
    expect(normalizarConfig("sequence", { sequence: { pattern: "CT-{n}/{ano}", scope: "year" } }, ctx)).toEqual({
      sequence: { pattern: "CT-{n}/{ano}", scope: "year", seed: 1, pad: 4 },
    });
    expect(erro("sequence", { sequence: { pattern: "CT" } })).toMatch(/\{n\}/);
    expect(erro("sequence", { sequence: { scope: "semana" } })).toMatch(/escopo/);
    expect(erro("sequence", { sequence: { scope: "parent" } })).toMatch(/pai/);
    expect(normalizarConfig("sequence", { sequence: { scope: "parent", parent_field: "parcelas", pad: "2" } }, ctx)).toMatchObject({
      sequence: { scope: "parent", parent_field: "parcelas", pad: 2 },
    });
    expect(erro("sequence", { sequence: { pad: 50 } })).toMatch(/zeros/);
  });

  it("rollup exige relação conhecida e campo para somas", () => {
    expect(normalizarConfig("rollup", { rollup: { via_field: "rel1" } }, ctx)).toEqual({ rollup: { via_field: "rel1", agg: "count" } });
    expect(erro("rollup", { rollup: { via_field: "x" } })).toMatch(/relação/);
    expect(erro("rollup", { rollup: { via_field: "rel1", agg: "sum" } })).toMatch(/slug/);
    expect(normalizarConfig("rollup", { rollup: { via_field: "rel1", agg: "sum", expr: "valor", format: "currency", filter_expr: "card.paga" } }, ctx)).toEqual({
      rollup: { via_field: "rel1", agg: "sum", expr: "valor", filter_expr: "card.paga", format: "currency" },
    });
  });

  it("fases de preenchimento valem para qualquer tipo e precisam ser fases do board", () => {
    expect(normalizarConfig("text", { fill_phases: ["f2", "f1", "f2"], editable_everywhere: true }, ctx)).toEqual({ fill_phases: ["f2", "f1"], editable_everywhere: true });
    expect(normalizarConfig("text", { fill_phases: ["f1"], editable_everywhere: "sim" }, ctx)).toEqual({ fill_phases: ["f1"] });
    expect(normalizarConfig("text", { origin_phase_id: "f2" }, ctx)).toEqual({ fill_phases: ["f2"] });
    expect(normalizarConfig("currency", { fill_phases: [], editable_everywhere: true }, ctx)).toEqual({ currency: { code: "BRL" } });
    expect(erro("text", { fill_phases: ["outra"] })).toMatch(/fase de preenchimento/);
  });

  it("tipo inválido, texto calculado e tipos sem config", () => {
    expect(erro("xpto", {})).toMatch(/inválido/);
    expect(erro("dynamic_text", {})).toMatch(/modelo/);
    expect(normalizarConfig("text", { lixo: 1 }, ctx)).toEqual({});
    expect(normalizarConfig("currency", {}, ctx)).toEqual({ currency: { code: "BRL" } });
  });

  it("extrai expressões CEL embutidas para validação", () => {
    expect(
      expressoesDaConfig({
        rollup: { expr: "valor", filter_expr: "card.paga" },
        dynamic_text: { template: "{numero} · {card.a - card.b}" },
      }).map((x) => x.fonte),
    ).toEqual(["card.paga", "card.a - card.b"]);
  });
});
