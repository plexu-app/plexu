import { describe, expect, it, vi } from "vitest";

describe("pool do banco", () => {
  it("sobrevive à reavaliação do módulo (hot reload do next dev): mesmo cliente, nenhum pool novo", async () => {
    const a = await import("../index");
    vi.resetModules();
    const b = await import("../index");
    expect(b.db).not.toBe(a.db); // o módulo foi de fato reavaliado
    expect(b.db.$client).toBe(a.db.$client);
  });
});
