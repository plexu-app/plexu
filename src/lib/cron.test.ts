import { describe, expect, it } from "vitest";
import { casa, parseCron, slotsEntre } from "./cron";

const TZ = "America/Sao_Paulo"; // UTC-3, sem horário de verão
const utc = (s: string) => new Date(`${s}Z`);

describe("cron", () => {
  it("campos: *, lista, faixa, passo; dia da semana 7 = domingo", () => {
    const c = parseCron("*/15 8-10 1,15 * 7");
    expect([...c.minutos]).toEqual([0, 15, 30, 45]);
    expect([...c.horas]).toEqual([8, 9, 10]);
    expect([...c.semana]).toEqual([0]);
    expect(() => parseCron("* * *")).toThrow(/5 campos/);
    expect(() => parseCron("60 * * * *")).toThrow(/minuto fora/);
  });

  it("avalia no fuso do workspace", () => {
    const c = parseCron("0 8 * * 1-5"); // 8h em dias úteis, horário de Brasília
    expect(casa(c, utc("2026-09-28T11:00:00"), TZ)).toBe(true); // segunda 08:00 BRT
    expect(casa(c, utc("2026-09-28T08:00:00"), TZ)).toBe(false);
    expect(casa(c, utc("2026-09-27T11:00:00"), TZ)).toBe(false); // domingo
  });

  it("dia do mês OU dia da semana quando ambos restritos", () => {
    const c = parseCron("0 0 1 * 1");
    expect(casa(c, utc("2026-10-01T03:00:00"), TZ)).toBe(true); // dia 1 (quinta)
    expect(casa(c, utc("2026-10-05T03:00:00"), TZ)).toBe(true); // segunda
    expect(casa(c, utc("2026-10-06T03:00:00"), TZ)).toBe(false);
  });

  it("slotsEntre: intervalo aberto no início, fechado no fim", () => {
    const s = slotsEntre("*/5 * * * *", TZ, utc("2026-09-28T12:00:00"), utc("2026-09-28T12:15:00"));
    expect(s.map((d) => d.toISOString().slice(11, 16))).toEqual(["12:05", "12:10", "12:15"]);
  });
});
