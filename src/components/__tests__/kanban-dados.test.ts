import { describe, expect, it } from "vitest";
import { camposDoCartao, corDaFase, montarCartoes, PALETA_FASES } from "../kanban-dados";
import { duracaoCurta, slaEmMs } from "@/lib/tempo";

const campos = [
  { id: "t", name: "Título", type: "text" },
  { id: "obs", name: "Obs", type: "long_text" },
  { id: "v", name: "Valor", type: "currency" },
  { id: "s", name: "Status", type: "select" },
  { id: "r", name: "Rel", type: "relation" },
  { id: "resp", name: "Responsável", type: "person" },
  { id: "d", name: "Vencimento", type: "date" },
];

describe("campos do cartão", () => {
  it("padrão: até 6 campos curtos, sem título, relação ou texto longo", () => {
    expect(camposDoCartao(campos, "t").map((c) => c.id)).toEqual(["v", "s", "resp", "d"]);
  });
  it("configurados: respeita ordem, ignora removidos e limita a 8", () => {
    expect(camposDoCartao(campos, "t", ["d", "sumiu", "v", "s", "obs"]).map((c) => c.id)).toEqual(["d", "v", "s", "obs"]);
    const muitos = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, type: "text" }));
    expect(camposDoCartao(muitos, null, muitos.map((c) => c.id))).toHaveLength(8);
  });
});

describe("montarCartoes", () => {
  const base = { title: "PD-1", phaseId: "p1", status: "open", computed: {}, assignees: [] as string[], dueAt: null as Date | null };
  const pessoas = new Map([
    ["u1", "Ana Lima"],
    ["u2", "Beto"],
  ]);
  const opcoes = { titleFieldId: "t", pessoas, hoje: "2026-09-24", prazoField: "d" };

  it("formata campos, omite vazios e pega responsável do campo pessoa", () => {
    const [c] = montarCartoes([{ ...base, id: "a", props: { v: 1500, s: "", resp: "u1" } }], campos, opcoes);
    expect(c.campos.map((x) => [x.nome, x.tipo])).toEqual([
      ["Valor", "currency"],
      ["Responsável", "person"],
    ]);
    expect(c.campos[0].texto).toMatch(/^R\$\s1\.500,00$/);
    expect(c.responsavel).toBe("Ana Lima");
    expect(c.prazo).toBeNull();
    expect(c.alerta).toBeNull();
  });

  it("assignees vence o campo pessoa; prazo vencido só para card aberto (e vira alerta vermelho)", () => {
    const [aberto, feito] = montarCartoes(
      [
        { ...base, id: "a", assignees: ["u2"], props: { resp: "u1", d: "2026-09-01" } },
        { ...base, id: "b", status: "done", props: { d: "2026-09-01" } },
      ],
      campos,
      opcoes,
    );
    expect(aberto.responsavel).toBe("Beto");
    expect(aberto.prazo).toEqual({ texto: "01/09/2026", atrasado: true, dias: -23 });
    expect(aberto.alerta).toBe("prazo");
    expect(feito.prazo).toEqual({ texto: "01/09/2026", atrasado: false, dias: -23 });
    expect(feito.alerta).toBeNull();
  });

  it("due_at do card tem prioridade sobre o campo de prazo", () => {
    const [c] = montarCartoes([{ ...base, id: "a", dueAt: new Date("2026-12-31T12:00:00Z"), props: { d: "2026-01-01" } }], campos, opcoes);
    expect(c.prazo).toEqual({ texto: "31/12/2026", atrasado: false, dias: 98 });
  });

  it("tempos no fluxo, na fase e desde a atualização; SLA da fase estourado vira alerta laranja", () => {
    const agora = Date.parse("2026-09-24T12:00:00Z");
    const [c, semFase] = montarCartoes(
      [
        {
          ...base,
          id: "a",
          props: {},
          createdAt: new Date(agora - 214 * 86_400_000),
          phaseEnteredAt: new Date(agora - 3 * 86_400_000),
          updatedAt: new Date(agora - 19 * 3_600_000),
        },
        { ...base, id: "b", props: {}, phaseEnteredAt: null },
      ],
      campos,
      { ...opcoes, agora, slaPorFase: new Map([["p1", { duration: 2, unit: "days" }]]) },
    );
    expect([duracaoCurta(c.tempos.fluxo), duracaoCurta(c.tempos.fase!), duracaoCurta(c.tempos.atualizacao)]).toEqual(["214d", "3d", "19h"]);
    expect(c.alerta).toBe("sla");
    expect(semFase.tempos.fase).toBeNull();
    expect(semFase.alerta).toBeNull();
  });

  it("contadores e conexões vêm dos extras", () => {
    const conexao = { board: "Clientes", cor: "var(--f5)", id: "x", titulo: "Mercado", href: "/c/x" };
    const [c] = montarCartoes([{ ...base, id: "a", props: {} }], campos, {
      ...opcoes,
      extras: { comentarios: new Map([["a", 2]]), anexos: new Map([["a", 1]]), conexoes: new Map([["a", [conexao]]]) },
    });
    expect([c.comentarios, c.anexos, c.conexoes]).toEqual([2, 1, [conexao]]);
  });

  it("cor da fase: definida ou paleta pela posição", () => {
    expect(corDaFase("#123456", 0)).toBe("#123456");
    expect(corDaFase(null, PALETA_FASES.length + 1)).toBe("var(--f2)");
    expect(corDaFase("f4", 0)).toBe("var(--f4)");
  });
});

describe("durações", () => {
  it("maior unidade inteira", () => {
    expect([duracaoCurta(0), duracaoCurta(59_000), duracaoCurta(5 * 60_000), duracaoCurta(2 * 3_600_000 + 1), duracaoCurta(3 * 86_400_000)]).toEqual([
      "0m",
      "0m",
      "5m",
      "2h",
      "3d",
    ]);
  });
  it("SLA em ms; inválido é null", () => {
    expect(slaEmMs({ duration: 2, unit: "hours" })).toBe(7_200_000);
    expect(slaEmMs({ duration: 1 })).toBe(86_400_000);
    expect([slaEmMs(null), slaEmMs({ duration: 0 }), slaEmMs({ duration: 3, unit: "anos" })]).toEqual([null, null, null]);
  });
});
