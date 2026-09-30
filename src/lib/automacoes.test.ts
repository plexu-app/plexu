import { describe, expect, it } from "vitest";
import { ErroAutomacao, normalizarGatilho, normalizarPassos, textoDoValor, trechosModelo } from "./automacoes";

describe("gatilhos", () => {
  it("normaliza e valida", () => {
    expect(normalizarGatilho({ type: "field_updated", fields: ["a", "a", ""] })).toEqual({ type: "field_updated", fields: ["a"] });
    expect(normalizarGatilho({ type: "scheduled", date_field: "f", offset_days: "-3" })).toEqual({ type: "scheduled", date_field: "f", offset_days: -3, time: "08:00" });
    expect(normalizarGatilho({ type: "scheduled", cron: "0 8 * * 1-5" })).toEqual({ type: "scheduled", cron: "0 8 * * 1-5" });
    expect(() => normalizarGatilho({ type: "scheduled", cron: "x" })).toThrow(ErroAutomacao);
    expect(() => normalizarGatilho({ type: "card_entered_phase" })).toThrow(/fase/);
    expect(() => normalizarGatilho({ type: "scheduled", date_field: "f", time: "25:00" })).toThrow(/HH:MM/);
    expect(() => normalizarGatilho({ type: "nada" })).toThrow(/desconhecido/);
  });
});

describe("passos", () => {
  it("set_field aceita null e expressão; expressão inválida é recusada com o passo", () => {
    expect(normalizarPassos([{ type: "set_field", field: "f", value: "" }])).toEqual([{ type: "set_field", field: "f", value: null }]);
    expect(normalizarPassos([{ type: "set_field", field: "f", expr: "card.a + 1" }])).toEqual([{ type: "set_field", field: "f", expr: "card.a + 1" }]);
    expect(() => normalizarPassos([{ type: "move_card", phase: "x" }, { type: "set_field", field: "f", expr: "card.a +" }])).toThrow(/passo 2/);
  });

  it("alvo: este card some do JSON; pai/filhos exigem relação", () => {
    expect(normalizarPassos([{ type: "move_card", phase: "f", target: { type: "self" } }])).toEqual([{ type: "move_card", phase: "f" }]);
    expect(normalizarPassos([{ type: "add_comment", body: "x", target: { type: "children", relation: "r" } }])[0]).toEqual({ type: "add_comment", body: "x", target: { type: "children", relation: "r" } });
    expect(() => normalizarPassos([{ type: "set_field", field: "f", value: 1, target: { type: "parent" } }])).toThrow(/relação do alvo/);
    expect(() => normalizarPassos([{ type: "set_field", field: "f", value: 1, target: { type: "primo", relation: "r" } }])).toThrow(/alvo inválido/);
  });

  it("modelos {{ }} validados; http exige URL e método", () => {
    expect(() => normalizarPassos([{ type: "send_email", to: "a@b", subject: "{{ card.( }}" }])).toThrow(/passo 1/);
    expect(() => normalizarPassos([{ type: "http_request", method: "GET", url: "ftp://x" }])).toThrow(/URL/);
    expect(normalizarPassos([{ type: "http_request", url: "https://x", headers: { A: "{{ var.T }}" } }])[0]).toMatchObject({ method: "POST", headers: { A: "{{ var.T }}" } });
  });
});

describe("modelos", () => {
  it("separa texto, expressão e variável", () => {
    expect(trechosModelo("Olá {{ card.nome }}, token {{var.TOKEN}}!")).toEqual([
      { tipo: "texto", valor: "Olá " },
      { tipo: "expr", valor: "card.nome" },
      { tipo: "texto", valor: ", token " },
      { tipo: "var", valor: "TOKEN" },
      { tipo: "texto", valor: "!" },
    ]);
    expect(textoDoValor(null)).toBe("");
    expect(textoDoValor(["a", 1])).toBe("a, 1");
  });
});
