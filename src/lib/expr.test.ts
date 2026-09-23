import { describe, expect, it } from "vitest";
import { compile, evaluate, evaluateBool, ExprError, lint, parse, type ExprContext, type ExprResolver } from "./expr";

const resolver: ExprResolver = {
  filhos: (rel) =>
    rel === "parcelas"
      ? [
          { numero: 1, valor: 100, medida: true, data_medicao: "2026-09-01" },
          { numero: 2, valor: 50.5, medida: false, data_medicao: null },
        ]
      : [],
  pais: (rel) => (rel === "contrato" ? [{ numero: "CT-0001", ativo: true }] : []),
  cartoes: (board) =>
    board === "parceiros" ? [{ cnpj: "11", bloqueado: false }, { cnpj: "22", bloqueado: true }] : [],
};

const ctx: ExprContext = {
  card: { valor: 1500, qtd: 3, nome: "Contrato X", prazo: "2026-10-01", cnpj: "22", vazio: null },
  pai: { numero: "CT-0001", tipo: "servico" },
  fase: "elaboracao",
  fase_origem: "triagem",
  fase_destino: "elaboracao",
  usuario: { id: "u1", email: "ana@ex.com" },
  hoje: "2026-09-23",
  resolver,
};

describe("card", () => {
  it("lê campos do card", () => {
    expect(evaluate("card.valor", ctx)).toBe(1500);
    expect(evaluate('card.nome + "!"', ctx)).toBe("Contrato X!");
    expect(evaluateBool("card.valor > 1000 && card.qtd == 3", ctx)).toBe(true);
  });

  it("campo ausente lê como null", () => {
    expect(evaluate("card.inexistente", ctx)).toBeNull();
    expect(evaluateBool("card.inexistente == null && card.vazio == null", ctx)).toBe(true);
  });

  it("mistura número do JSON com literal inteiro", () => {
    expect(evaluate("card.valor / 2", ctx)).toBe(750);
    expect(evaluate("card.qtd + 1", ctx)).toBe(4);
    expect(evaluate("2 * card.valor", ctx)).toBe(3000);
    expect(evaluate("card.valor * 1.1", ctx)).toBeCloseTo(1650);
  });

  it("converte Date e undefined nos dados", () => {
    const c = { ...ctx, card: { quando: new Date("2026-01-02T03:04:05Z"), nada: undefined } };
    expect(evaluate("card.quando", c)).toBe("2026-01-02T03:04:05.000Z");
    expect(evaluate("card.nada == null", c)).toBe(true);
  });
});

describe("pai e pais()", () => {
  it("lê o card pai", () => {
    expect(evaluate("pai.numero", ctx)).toBe("CT-0001");
    expect(evaluateBool('pai.tipo == "servico"', ctx)).toBe(true);
  });

  it("pai ausente é null", () => {
    expect(evaluateBool("pai == null", { ...ctx, pai: null })).toBe(true);
    expect(evaluateBool("pai == null", { ...ctx, pai: undefined })).toBe(true);
  });

  it("pais(rel) devolve a lista da relação", () => {
    expect(evaluate('pais("contrato").contar()', ctx)).toBe(1);
    expect(evaluateBool('pais("contrato").todos(p, p.ativo)', ctx)).toBe(true);
    expect(evaluate('pais("outra").contar()', ctx)).toBe(0);
  });
});

describe("filhos()", () => {
  it("todos(x, cond) e forma implícita com item", () => {
    expect(evaluateBool('filhos("parcelas").todos(p, p.valor > 10)', ctx)).toBe(true);
    expect(evaluateBool('filhos("parcelas").todos(p, p.medida)', ctx)).toBe(false);
    expect(evaluateBool('filhos("parcelas").todos(item.valor > 10)', ctx)).toBe(true);
    expect(evaluateBool('filhos("parcelas").todos(item.data_medicao != null)', ctx)).toBe(false);
  });

  it("algum(x, cond)", () => {
    expect(evaluateBool('filhos("parcelas").algum(p, p.medida)', ctx)).toBe(true);
    expect(evaluateBool('filhos("parcelas").algum(item.valor > 1000)', ctx)).toBe(false);
  });

  it("lista vazia: todos é true e algum é false", () => {
    expect(evaluateBool('filhos("nada").todos(item.medida)', ctx)).toBe(true);
    expect(evaluateBool('filhos("nada").algum(item.medida)', ctx)).toBe(false);
  });

  it("contar() e soma(slug)", () => {
    expect(evaluate('filhos("parcelas").contar()', ctx)).toBe(2);
    expect(evaluate('filhos("parcelas").soma("valor")', ctx)).toBe(150.5);
    expect(evaluate('filhos("parcelas").soma("inexistente")', ctx)).toBe(0);
    expect(evaluateBool('filhos("parcelas").contar() > 1 && filhos("parcelas").soma("valor") < 200', ctx)).toBe(true);
  });

  it("compõe com macros padrão do CEL", () => {
    expect(evaluate('filhos("parcelas").filter(p, p.medida).soma("valor")', ctx)).toBe(100);
    expect(evaluate('filhos("parcelas").map(p, p.numero)', ctx)).toEqual([1, 2]);
    expect(evaluate('filhos("parcelas").exists(p, p.numero == 2)', ctx)).toBe(true);
  });

  it("sem resolver, falha com erro de avaliação", () => {
    const sem = { ...ctx, resolver: undefined };
    expect(() => evaluate('filhos("parcelas").contar()', sem)).toThrowError(ExprError);
    try {
      evaluate('filhos("parcelas").contar()', sem);
    } catch (e) {
      expect((e as ExprError).codigo).toBe("avaliacao");
      expect((e as ExprError).message).toMatch(/filhos/);
    }
  });
});

describe("fase, usuario e hoje()", () => {
  it("fases", () => {
    expect(evaluateBool('fase == "elaboracao"', ctx)).toBe(true);
    expect(evaluateBool('fase_origem == "triagem" && fase_destino == "elaboracao"', ctx)).toBe(true);
    expect(evaluateBool('fase in ["triagem", "elaboracao"]', ctx)).toBe(true);
    expect(evaluateBool("fase_destino == null", { ...ctx, fase_destino: undefined })).toBe(true);
  });

  it("usuario", () => {
    expect(evaluateBool('usuario.id == "u1"', ctx)).toBe(true);
    expect(evaluate("usuario.grupo", ctx)).toBeNull();
    expect(evaluateBool("usuario == null", { ...ctx, usuario: null })).toBe(true);
  });

  it("hoje() usa a data do contexto", () => {
    expect(evaluate("hoje()", ctx)).toBe("2026-09-23");
    expect(evaluateBool("hoje() < card.prazo", ctx)).toBe(true);
    expect(evaluate("hoje()", { ...ctx, hoje: new Date(2026, 0, 5) })).toBe("2026-01-05");
  });

  it("hoje() sem data no contexto usa a data atual", () => {
    expect(evaluate("hoje()", { card: {} })).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("existe() e cartoes()", () => {
  it("existe(board, x, cond)", () => {
    expect(evaluateBool('existe("parceiros", p, p.cnpj == card.cnpj)', ctx)).toBe(true);
    expect(evaluateBool('existe("parceiros", p, p.cnpj == "99")', ctx)).toBe(false);
    expect(evaluateBool('existe("parceiros", item.cnpj == card.cnpj && item.bloqueado)', ctx)).toBe(true);
    expect(evaluateBool('existe("vazio", item.cnpj == "11")', ctx)).toBe(false);
  });

  it("cartoes(board) como lista", () => {
    expect(evaluate('cartoes("parceiros").filter(c, !c.bloqueado).contar()', ctx)).toBe(1);
  });
});

describe("compile()", () => {
  it("reutiliza a expressão compilada com contextos diferentes", () => {
    const regra = compile("card.valor > 1000");
    expect(regra.evaluateBool(ctx)).toBe(true);
    expect(regra.evaluateBool({ card: { valor: 10 } })).toBe(false);
    expect(regra.fonte).toBe("card.valor > 1000");
  });

  it("evaluateBool exige booleano", () => {
    expect(() => compile("card.valor").evaluateBool(ctx)).toThrowError(/booleano/);
  });

  it("expõe referências e avisos", () => {
    const c = compile('card.a != 10 || card.a != 20');
    expect(c.referencias.card).toEqual(["a"]);
    expect(c.avisos[0]?.tipo).toBe("tautologia");
  });

  it("expressões constantes (decisão 11: sim/não)", () => {
    expect(compile("true").evaluateBool(ctx)).toBe(true);
    expect(compile("false").evaluateBool(ctx)).toBe(false);
    expect(compile("true").avisos).toEqual([]);
  });
});

describe("parse(): sintaxe e referências", () => {
  it("erro de sintaxe com posição", () => {
    const r = parse("card.valor >");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro.codigo).toBe("sintaxe");
      expect(r.erro.posicao).toEqual({ inicio: 12, fim: 12 });
    }
    expect(parse("").ok).toBe(false);
    expect(parse("card.valor ==== 1").ok).toBe(false);
  });

  it("erro de tipo/nome desconhecido", () => {
    const r = parse("xpto == 1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.codigo).toBe("tipo");
    expect(parse("funcao_inexistente(1)").ok).toBe(false);
    expect(parse('1 + "a"').ok).toBe(false);
    expect(parse('filhos("p").todos(p.medida)').ok).toBe(false);
  });

  it("compile lança ExprError com código", () => {
    expect(() => compile("card.valor >")).toThrowError(ExprError);
    try {
      compile("(card.valor");
    } catch (e) {
      expect((e as ExprError).codigo).toBe("sintaxe");
    }
  });

  it("coleta referências de todas as fontes", () => {
    const r = parse(
      'card.valor > 0 && pai.tipo == "x" && filhos("parcelas").todos(p, p.medida && card.ok) ' +
        '&& pais("contrato").contar() > 0 && existe("parceiros", c, c.cnpj == card.cnpj) ' +
        '&& fase == fase_destino && usuario.id != null && hoje() > card.prazo && cartoes("bases").contar() > 0',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.referencias).toEqual({
        card: ["cnpj", "ok", "prazo", "valor"],
        pai: ["tipo"],
        filhos: ["parcelas"],
        pais: ["contrato"],
        boards: ["bases", "parceiros"],
        globais: ["fase", "fase_destino", "hoje", "usuario"],
      });
      expect(r.avisos).toEqual([]);
    }
  });

  it("não confunde variável de iteração com card", () => {
    const r = parse('filhos("x").todos(card_, card_.a == 1)');
    expect(r.ok && r.referencias.card).toEqual([]);
  });

  it("avisa sobre referência dinâmica", () => {
    const r = parse("filhos(card.rel).contar() > 0");
    expect(r.ok && r.referencias.filhos).toEqual([]);
    expect(r.ok && r.avisos.map((a) => a.tipo)).toEqual(["referencia_dinamica"]);
  });
});

describe("lint()", () => {
  const tipos = (e: string) => lint(e).map((a) => a.tipo);

  it("tautologias", () => {
    expect(tipos("card.a != 10 || card.a != 20")).toEqual(["tautologia"]);
    expect(tipos('card.s != "a" || card.s != "b"')).toEqual(["tautologia"]);
    expect(tipos("card.a == 1 || card.a != 1")).toEqual(["tautologia"]);
    expect(tipos("card.a < 5 || card.a >= 5")).toEqual(["tautologia"]);
    expect(tipos("card.a < 10 || card.a > 5")).toEqual(["tautologia"]);
    expect(tipos("card.ok || !card.ok")).toEqual(["tautologia"]);
    expect(tipos("true || card.ok")).toEqual(["tautologia"]);
  });

  it("contradições", () => {
    expect(tipos("card.a == 10 && card.a == 20")).toEqual(["contradicao"]);
    expect(tipos("card.a == 1 && card.a != 1")).toEqual(["contradicao"]);
    expect(tipos("card.a > 10 && card.a < 5")).toEqual(["contradicao"]);
    expect(tipos("card.a >= 10 && card.a < 10")).toEqual(["contradicao"]);
    expect(tipos("card.ok && !card.ok")).toEqual(["contradicao"]);
    expect(tipos("false && card.ok")).toEqual(["contradicao"]);
  });

  it("redundâncias", () => {
    expect(tipos("card.a > 5 && card.a > 3")).toEqual(["redundancia"]);
    expect(tipos("card.a > 5 || card.a > 3")).toEqual(["redundancia"]);
    expect(tipos("card.a == 1 && card.a == 1")).toEqual(["redundancia"]);
    expect(tipos("true && card.ok")).toEqual(["redundancia"]);
  });

  it("não acusa expressões válidas", () => {
    expect(tipos("card.a > 5 && card.a < 10")).toEqual([]);
    expect(tipos("card.a == 10 || card.a == 20")).toEqual([]);
    expect(tipos("card.a != 10 && card.a != 20")).toEqual([]);
    expect(tipos("card.a > 5 && card.b < 3")).toEqual([]);
    expect(tipos('card.s == "a" || card.t == "a"')).toEqual([]);
    expect(tipos("card.a < 5 || card.a > 10")).toEqual([]);
  });

  it("analisa grupos aninhados e dá posição", () => {
    const avisos = lint('fase == "x" && filhos("p").todos(i, i.a != 1 || i.a != 2)');
    expect(avisos).toHaveLength(1);
    expect(avisos[0].tipo).toBe("tautologia");
    expect(avisos[0].posicao.inicio).toBeGreaterThan(0);
  });

  it("expressão inválida não gera avisos", () => {
    expect(lint("card.a >")).toEqual([]);
  });
});
