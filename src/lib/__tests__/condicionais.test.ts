import { describe, expect, it } from "vitest";
import { compilarCondicionais, normalizarCondicionais, type Condicional } from "../condicionais";

const c = (x: Partial<Condicional> & Pick<Condicional, "condicao">): Condicional => ({ id: "c", nome: "C", seVerdadeiro: [], seFalso: [], ...x });

describe("condicionais em campos → expressões", () => {
  it("exibir quando verdadeiro: o campo começa oculto e aparece com a condição", () => {
    const r = compilarCondicionais([c({ condicao: "card.expressa == true", seVerdadeiro: [{ acao: "exibir", campos: ["janela"] }] })]);
    expect(r.visivel).toEqual({ janela: "(card.expressa == true)" });
    expect(r.obrigatorio).toEqual({});
  });

  it("ocultar quando falso e tornar obrigatório quando verdadeiro", () => {
    const r = compilarCondicionais([
      c({ condicao: "card.valor > 1000", seVerdadeiro: [{ acao: "obrigatorio", campos: ["aprovador"] }], seFalso: [{ acao: "ocultar", campos: ["aprovador"] }] }),
    ]);
    expect(r.visivel).toEqual({ aprovador: "(card.valor > 1000)" }); // começa visível; oculto quando falso
    expect(r.obrigatorio).toEqual({ aprovador: "(card.valor > 1000)" });
  });

  it("a ordem importa: a última condicional que se aplica vence", () => {
    const r = compilarCondicionais([
      c({ condicao: "card.a == 1", seVerdadeiro: [{ acao: "exibir", campos: ["x"] }] }),
      c({ condicao: "card.b == 2", seVerdadeiro: [{ acao: "ocultar", campos: ["x"] }] }),
    ]);
    // começa oculto; a == 1 mostra; b == 2 esconde por cima
    expect(r.visivel.x).toBe("!(card.b == 2) && (card.a == 1)");
  });

  it("tornar opcional faz o campo começar obrigatório", () => {
    expect(compilarCondicionais([c({ condicao: "card.urgente == false", seVerdadeiro: [{ acao: "opcional", campos: ["y"] }] })]).obrigatorio).toEqual({
      y: "!(card.urgente == false)",
    });
  });

  it("bloquear edição vira regra can_edit: edita quando nenhuma condicional bloqueia", () => {
    const r = compilarCondicionais([
      c({ nome: "Fechado", condicao: "card.fechado == true", seVerdadeiro: [{ acao: "bloquear", campos: ["valor"] }] }),
      c({ nome: "Sem dono", condicao: "card.dono != null", seFalso: [{ acao: "bloquear", campos: ["valor"] }] }),
    ]);
    expect(r.bloqueio).toEqual({ valor: { expr: "!(card.fechado == true) && (card.dono != null)", nomes: ["Fechado", "Sem dono"] } });
  });

  it("valida nomes, ações e campos", () => {
    const ok = new Set(["janela"]);
    expect(normalizarCondicionais([{ nome: "", condicao: "true", seVerdadeiro: [] }], ok)).toMatch(/nome/);
    expect(normalizarCondicionais([{ nome: "A", condicao: "true", seVerdadeiro: [{ acao: "voar", campos: ["janela"] }] }], ok)).toMatch(/ação inválida/);
    expect(normalizarCondicionais([{ nome: "A", condicao: "true", seVerdadeiro: [{ acao: "exibir", campos: ["outro"] }] }], ok)).toMatch(/campo inexistente/);
    expect(normalizarCondicionais([{ nome: "A", condicao: "true", seVerdadeiro: [] }], ok)).toMatch(/ao menos uma ação/);
    expect(normalizarCondicionais([{ id: "k", nome: " A ", condicao: " card.x ", seVerdadeiro: [{ acao: "exibir", campos: ["janela", "janela"] }] }], ok)).toEqual([
      { id: "k", nome: "A", condicao: "card.x", seVerdadeiro: [{ acao: "exibir", campos: ["janela"] }], seFalso: [] },
    ]);
  });
});
