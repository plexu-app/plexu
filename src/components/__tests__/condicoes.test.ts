// Construtor de condições: gera CEL correto e faz o caminho inverso.
import { describe, expect, it } from "vitest";
import { compile, parse } from "@/lib/expr";
import { gerarCel, grupoVazio, literalCel, parseCel, resumir, type Grupo } from "../condicoes/modelo";

const g = (op: "&&" | "||", ...itens: Grupo["itens"]): Grupo => ({ tipo: "grupo", op, itens });

describe("modelo → CEL", () => {
  it("condições simples por operador", () => {
    expect(gerarCel({ tipo: "condicao", campo: "card.valor", op: ">", valor: 1000 })).toBe("card.valor > 1000");
    expect(gerarCel({ tipo: "condicao", campo: "card.valor", op: "<=", valor: 10.5 })).toBe("card.valor <= 10.5");
    expect(gerarCel({ tipo: "condicao", campo: "card.tipo", op: "==", valor: 'servi"ço' })).toBe('card.tipo == "servi\\"ço"');
    expect(gerarCel({ tipo: "condicao", campo: "card.medida", op: "==", valor: true })).toBe("card.medida == true");
    expect(gerarCel({ tipo: "condicao", campo: "card.objeto", op: "vazio" })).toBe("card.objeto == null");
    expect(gerarCel({ tipo: "condicao", campo: "card.objeto", op: "preenchido" })).toBe("card.objeto != null");
    expect(gerarCel({ tipo: "condicao", campo: "card.nome", op: "contem", valor: "ltda" })).toBe('card.nome.contains("ltda")');
    expect(gerarCel({ tipo: "condicao", campo: "fase", op: "em", valor: ["A", "B"] })).toBe('fase in ["A", "B"]');
  });

  it("grupos E/OU com aninhamento entre parênteses; vazio = true", () => {
    const m = g(
      "&&",
      { tipo: "condicao", campo: "card.objeto", op: "preenchido" },
      g("||", { tipo: "condicao", campo: "card.valor", op: ">", valor: 1000 }, { tipo: "condicao", campo: "fase", op: "==", valor: "Vigente" }),
    );
    expect(gerarCel(m)).toBe('card.objeto != null && (card.valor > 1000 || fase == "Vigente")');
    expect(gerarCel(grupoVazio())).toBe("true");
    expect(gerarCel(g("||", { tipo: "condicao", campo: "card.a", op: "vazio" }))).toBe("card.a == null");
  });

  it("literais: número inválido é recusado", () => {
    expect(() => literalCel(Number.NaN)).toThrow();
    expect(literalCel(-3)).toBe("-3");
  });

  it("o CEL gerado é válido no motor e avalia como esperado", () => {
    const cel = gerarCel(
      g(
        "&&",
        { tipo: "condicao", campo: "card.valor", op: ">=", valor: 100 },
        { tipo: "condicao", campo: "card.nome", op: "contem", valor: "Beta" },
        { tipo: "condicao", campo: "fase", op: "em", valor: ["Elaboração", "Vigente"] },
      ),
    );
    expect(parse(cel).ok).toBe(true);
    const e = compile(cel);
    expect(e.evaluateBool({ card: { valor: 150, nome: "Construtora Beta" }, fase: "Vigente" })).toBe(true);
    expect(e.evaluateBool({ card: { valor: 50, nome: "Construtora Beta" }, fase: "Vigente" })).toBe(false);
  });
});

describe("CEL → modelo", () => {
  const ida_e_volta = (cel: string) => {
    const m = parseCel(cel);
    expect(m, cel).not.toBeNull();
    return gerarCel(m!);
  };

  it("é o inverso da geração (ida e volta estável)", () => {
    for (const cel of [
      "card.valor > 1000",
      'card.objeto != null && (card.valor > 1000 || fase == "Vigente")',
      'card.nome.contains("ltda") || card.tipo == "compra"',
      'fase in ["A", "B"] && card.medida == true',
      "card.a == null && card.b != null && card.c <= -2.5",
      '(card.a == 1 && card.b == 2) || (card.c == 3 && pai.d != "x")',
      "true",
    ]) {
      expect(ida_e_volta(cel)).toBe(cel);
    }
  });

  it("normaliza espaços, parênteses redundantes e grupos do mesmo operador", () => {
    expect(ida_e_volta("(card.a==1)&&((card.b==2)&&card.c==3)")).toBe("card.a == 1 && card.b == 2 && card.c == 3");
    expect(parseCel("")).toEqual(grupoVazio());
  });

  it("monta a árvore esperada", () => {
    expect(parseCel('card.x == null || fase_destino == "Vigente"')).toEqual(
      g("||", { tipo: "condicao", campo: "card.x", op: "vazio" }, { tipo: "condicao", campo: "fase_destino", op: "==", valor: "Vigente" }),
    );
    expect(parseCel("card.valor > 10")).toEqual(g("&&", { tipo: "condicao", campo: "card.valor", op: ">", valor: 10 }));
  });

  it("recusa o que não é representável (fica só no modo avançado)", () => {
    for (const cel of [
      'filhos("parcelas").todos(p, p.medida == true)',
      "!card.ativo",
      "card.a + 1 > 2",
      "card.a > card.b",
      "size(card.tags) > 0",
      "hoje() > card.prazo",
      "card.a.b == 1",
      "outra == 1",
      "card.a == 1 ? true : false",
      "card.a > ",
    ]) {
      expect(parseCel(cel), cel).toBeNull();
    }
  });
});

describe("resumo em português", () => {
  it("usa rótulos e conectivos", () => {
    const nomes: Record<string, string> = { "card.objeto": "Objeto", "card.valor": "Valor", fase: "Fase" };
    const m = parseCel('card.objeto != null && (card.valor > 1000.5 || fase in ["A", "B"])')!;
    expect(resumir(m, (c) => nomes[c] ?? c)).toBe('Objeto está preenchido e (Valor > 1000,5 ou Fase é um de "A", "B")');
    expect(resumir(grupoVazio())).toBe("sempre");
    expect(resumir(parseCel("card.medida == true")!)).toBe("card.medida é sim");
  });
});
