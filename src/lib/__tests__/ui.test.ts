import { describe, expect, it } from "vitest";
import { descreverEvento, formatarData, formatarValor, idCurto, tituloOu, valorDoCard } from "../formatar";
import { nomeInput, propsDoForm, valorDoForm } from "../form-campos";
import { colunasSubTabela, moverLocal } from "../kanban";
import { slugCampo, slugify, slugLivre } from "../slug";

describe("slug", () => {
  it("normaliza acentos e símbolos", () => {
    expect(slugify("Gestão de Contratos 2026!")).toBe("gestao-de-contratos-2026");
    expect(slugify("  ")).toBe("item");
    expect(slugify("a".repeat(80))).toHaveLength(48);
  });
  it("escolhe o primeiro slug livre", () => {
    expect(slugLivre("contratos", [])).toBe("contratos");
    expect(slugLivre("contratos", ["contratos", "contratos-2"])).toBe("contratos-3");
  });
  it("slug de campo é identificador CEL", () => {
    expect(slugCampo("Valor pago (R$)")).toBe("valor_pago_r");
    expect(slugCampo("2º aditivo")).toBe("c_2_aditivo");
  });
});

describe("formatar", () => {
  const campo = (type: string, config: Record<string, unknown> = {}) => ({ id: "f", name: "Campo", type, config });

  it("id curto e título de fallback", () => {
    expect(idCurto("818798af-10ac-4b57-9bb7-0318f75e03ff")).toBe("818798af");
    expect(tituloOu("", "818798af-10ac")).toBe("Sem título · 818798af");
    expect(tituloOu("Contrato", "x")).toBe("Contrato");
  });

  it("valores por tipo", () => {
    expect(formatarValor(campo("currency"), 1234.5)).toBe("R$ 1.234,50");
    expect(formatarValor(campo("rollup", { rollup: { format: "currency" } }), 10)).toBe("R$ 10,00");
    expect(formatarValor(campo("rollup"), 1000)).toBe("1.000");
    expect(formatarValor(campo("date"), "2026-09-23")).toBe("23/09/2026");
    expect(formatarData("x")).toBe("x");
    expect(formatarValor(campo("boolean"), true)).toBe("Sim");
    expect(formatarValor(campo("boolean"), false)).toBe("Não");
    expect(formatarValor(campo("cpf"), "52998224725")).toBe("529.982.247-25");
    expect(formatarValor(campo("cnpj"), "12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
    expect(formatarValor(campo("multi_select"), ["a", "b"])).toBe("a, b");
    expect(formatarValor(campo("person"), "u1", new Map([["u1", "Ana"]]))).toBe("Ana");
    expect(formatarValor(campo("text"), null)).toBe("");
  });

  it("valor vem de computed para calculados e de props para o resto (sequence inclusive)", () => {
    const card = { props: { a: "CT-0001", b: 1 }, computed: { c: 10 } };
    expect(valorDoCard({ id: "a", type: "sequence" }, card)).toBe("CT-0001");
    expect(valorDoCard({ id: "c", type: "rollup" }, card)).toBe(10);
    expect(valorDoCard({ id: "z", type: "text" }, card)).toBeNull();
  });

  it("descreve eventos do histórico", () => {
    const ctx = {
      campos: new Map([["f1", { id: "f1", name: "Valor", type: "currency" }]]),
      fases: new Map([
        ["p1", "Elaboração"],
        ["p2", "Vigente"],
      ]),
      cards: new Map([["c2", "PAR-001"]]),
    };
    expect(descreverEvento({ type: "card.created", data: { phase_id: "p1" } }, ctx)).toBe("criou o card em Elaboração");
    expect(descreverEvento({ type: "card.moved", data: { from_phase: "p1", to_phase: "p2" } }, ctx)).toBe("moveu de Elaboração para Vigente");
    expect(descreverEvento({ type: "card.field_updated", data: { field_id: "f1", old: null, new: 10 } }, ctx)).toBe(
      "alterou Valor: vazio → R$ 10,00",
    );
    expect(descreverEvento({ type: "card.field_updated", data: { field_id: "f1", old: 1, new: 2, computed: true } }, ctx)).toMatch(/^recalculou Valor/);
    expect(
      descreverEvento({ type: "card.link_added", data: { field_id: "x", lado: "origem", from_card_id: "c1", to_card_id: "c2" } }, ctx),
    ).toBe("ligou PAR-001 (relação)");
    expect(descreverEvento({ type: "comment.added", data: {} }, ctx)).toBe("comentou");
    expect(descreverEvento({ type: "outro.tipo", data: {} }, ctx)).toBe("outro.tipo");
  });
});

describe("form-campos", () => {
  it("converte strings do HTML por tipo", () => {
    expect(valorDoForm("text", [""])).toBeNull();
    expect(valorDoForm("text", [" x "])).toBe("x");
    expect(valorDoForm("boolean", [])).toBe(false);
    expect(valorDoForm("boolean", ["on"])).toBe(true);
    expect(valorDoForm("multi_select", ["a", "", "b"])).toEqual(["a", "b"]);
    expect(valorDoForm("currency", ["1.234,56"])).toBe("1234.56");
    expect(valorDoForm("currency", ["250,5"])).toBe("250.5");
    expect(valorDoForm("number", ["1234.5"])).toBe("1234.5");
    expect(valorDoForm("number", [""])).toBeNull();
  });

  it("monta props só dos campos informados", () => {
    const f = new FormData();
    f.set(nomeInput("t"), "Título");
    f.set(nomeInput("n"), "");
    f.append(nomeInput("m"), "a");
    const props = propsDoForm(f, [
      { id: "t", type: "text" },
      { id: "n", type: "number" },
      { id: "b", type: "boolean" },
      { id: "m", type: "multi_select" },
      { id: "ausente", type: "text" },
    ]);
    expect(props).toEqual({ t: "Título", n: null, b: false, m: ["a"] });
  });
});

describe("kanban", () => {
  it("move otimista sem alterar os outros", () => {
    const cards = [
      { id: "a", title: "", phaseId: "p1" },
      { id: "b", title: "", phaseId: "p1" },
    ];
    const r = moverLocal(cards, "a", "p2");
    expect(r.map((c) => c.phaseId)).toEqual(["p2", "p1"]);
    expect(cards[0].phaseId).toBe("p1");
  });

  it("colunas da sub-tabela ignoram relação e título", () => {
    const campos = [
      { id: "t", type: "text" },
      { id: "r", type: "relation" },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, type: "number" })),
    ];
    expect(colunasSubTabela(campos, "t").map((c) => c.id)).toEqual(["c0", "c1", "c2", "c3", "c4", "c5"]);
  });
});
