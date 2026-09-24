import { describe, expect, it } from "vitest";
import { camposDoCartao, corDaFase, montarCartoes, PALETA_FASES } from "../kanban-dados";

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
  it("padrão: 3 primeiros campos curtos, sem título, relação ou texto longo", () => {
    expect(camposDoCartao(campos, "t").map((c) => c.id)).toEqual(["v", "s", "resp"]);
  });
  it("configurados: respeita ordem, ignora removidos e limita a 3", () => {
    expect(camposDoCartao(campos, "t", ["d", "sumiu", "v", "s", "obs"]).map((c) => c.id)).toEqual(["d", "v", "s"]);
  });
});

describe("montarCartoes", () => {
  const base = { title: "CT-1", phaseId: "p1", status: "open", computed: {}, assignees: [] as string[], dueAt: null as Date | null };
  const pessoas = new Map([
    ["u1", "Ana Lima"],
    ["u2", "Beto"],
  ]);
  const opcoes = { titleFieldId: "t", pessoas, hoje: "2026-09-24", prazoField: "d" };

  it("formata campos, omite vazios e pega responsável do campo pessoa", () => {
    const [c] = montarCartoes([{ ...base, id: "a", props: { v: 1500, s: "", resp: "u1" } }], campos, opcoes);
    expect(c.campos).toEqual([
      { nome: "Valor", texto: "R$ 1.500,00" },
      { nome: "Responsável", texto: "Ana Lima" },
    ]);
    expect(c.responsavel).toBe("Ana Lima");
    expect(c.prazo).toBeNull();
  });

  it("assignees vence o campo pessoa; prazo vencido só para card aberto", () => {
    const [aberto, feito] = montarCartoes(
      [
        { ...base, id: "a", assignees: ["u2"], props: { resp: "u1", d: "2026-09-01" } },
        { ...base, id: "b", status: "done", props: { d: "2026-09-01" } },
      ],
      campos,
      opcoes,
    );
    expect(aberto.responsavel).toBe("Beto");
    expect(aberto.prazo).toEqual({ texto: "01/09/2026", atrasado: true });
    expect(feito.prazo).toEqual({ texto: "01/09/2026", atrasado: false });
  });

  it("due_at do card tem prioridade sobre o campo de prazo", () => {
    const [c] = montarCartoes([{ ...base, id: "a", dueAt: new Date("2026-12-31T12:00:00Z"), props: { d: "2026-01-01" } }], campos, opcoes);
    expect(c.prazo).toEqual({ texto: "31/12/2026", atrasado: false });
  });

  it("cor da fase: definida ou paleta pela posição", () => {
    expect(corDaFase("#123456", 0)).toBe("#123456");
    expect(corDaFase(null, PALETA_FASES.length + 1)).toBe(PALETA_FASES[1]);
  });
});
