import { describe, expect, it } from "vitest";
import { ErroConfigCampo, expressoesDaConfig, normalizarConfig, type ContextoConfig } from "../config-campos";
import { colunasDisponiveis, colunasVisiveis, linhasDaLista } from "../lista";
import { duracaoCurta } from "../tempo";

describe("lista", () => {
  const campos = [
    { id: "t", name: "Título", type: "text" },
    { id: "v", name: "Valor", type: "currency" },
    { id: "r", name: "Rel", type: "relation" },
    { id: "g", name: "Global", type: "rollup" },
    { id: "p", name: "Dono", type: "person" },
  ];
  const agora = Date.parse("2026-09-24T12:00:00Z");
  const card = (id: string, extra: object) => ({
    id,
    title: "",
    phaseId: null as string | null,
    status: "open",
    props: {} as Record<string, unknown>,
    computed: {} as Record<string, unknown>,
    assignees: [] as string[],
    dueAt: null as Date | null,
    phaseEnteredAt: null as Date | null,
    createdAt: new Date(agora - 3 * 86_400_000),
    updatedAt: new Date(agora - 2 * 3_600_000),
    ...extra,
  });

  it("colunas: sistema primeiro (fase e tempo na fase só em fluxo); campos sem título nem relação", () => {
    expect(colunasDisponiveis(campos, "t", true).map((c) => c.id)).toEqual([
      "__fase", "__titulo", "__vencimento", "__responsaveis", "__tempo_fase", "__tempo_fluxo", "__atualizacao", "v", "g", "p",
    ]);
    expect(colunasDisponiveis(campos, "t", false).map((c) => c.id)).not.toContain("__fase");
  });

  it("colunas salvas: na ordem salva, ignorando as que sumiram; sem escolha, todas", () => {
    const todas = colunasDisponiveis(campos, "t", true);
    expect(colunasVisiveis(todas, ["v", "sumiu", "__titulo"]).map((c) => c.id)).toEqual(["v", "__titulo"]);
    expect(colunasVisiveis(todas, undefined)).toHaveLength(todas.length);
  });

  it("linhas: fase, título, responsáveis (assignees + campo pessoa), durações e valores formatados", () => {
    const [l1, l2] = linhasDaLista(
      [
        card("a1", { title: "Pedido Ação", phaseId: "p1", assignees: ["u1"], props: { v: 10, p: "u2" }, computed: { g: 5 }, phaseEnteredAt: new Date(agora - 19 * 3_600_000) }),
        card("b2", { dueAt: new Date("2026-12-31T12:00:00Z") }),
      ],
      campos,
      { fases: new Map([["p1", { nome: "Novo", cor: "var(--f1)" }]]), pessoas: new Map([["u1", "Ana"], ["u2", "Beto"]]), duracao: duracaoCurta, agora },
    );
    expect(l1.textos.__fase).toBe("Novo");
    expect(l1.corFase).toBe("var(--f1)");
    expect(l1.textos.__responsaveis).toBe("Ana, Beto");
    expect([l1.textos.__tempo_fase, l1.textos.__tempo_fluxo, l1.textos.__atualizacao]).toEqual(["19h", "3d", "2h"]);
    expect(l1.textos.v).toMatch(/^R\$\s10,00$/);
    expect(l1.textos.g).toBe("5");
    expect(l2.titulo).toBe("Sem título · b2");
    expect(l2.textos.__vencimento).toBe("31/12/2026");
    expect(l2.textos.__tempo_fase).toBe("");
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
