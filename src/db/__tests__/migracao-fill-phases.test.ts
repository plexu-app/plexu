// Migração 0002: origin_phase_id → fill_phases = [origem]; idempotente e sem tocar em fill_phases existente.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { criarBoard, criarCampo, criarWorkspace } from "../../core/__tests__/fixtures";
import { db } from "..";
import { fields } from "../schema";

const SQL = readFileSync(join(__dirname, "../migrations/0002_fill_phases.sql"), "utf8");
const config = async (id: string) => (await db.select({ c: fields.config }).from(fields).where(eq(fields.id, id)))[0].c;

describe("migração 0002_fill_phases", () => {
  it("converte origin_phase_id em fill_phases e remove a chave antiga", async () => {
    const w = await criarWorkspace();
    const b = await criarBoard(w.ws.id, "mig", [{ name: "a" }, { name: "b" }]);
    const legado = await criarCampo(b.id, { slug: "legado", type: "text", config: { origin_phase_id: b.fases.b } });
    const novo = await criarCampo(b.id, { slug: "novo", type: "text", config: { origin_phase_id: b.fases.a, fill_phases: [b.fases.b] } });
    const sem = await criarCampo(b.id, { slug: "sem", type: "currency", config: { currency: { code: "BRL" } } });

    await db.execute(sql.raw(SQL));
    await db.execute(sql.raw(SQL)); // idempotente

    expect(await config(legado)).toEqual({ fill_phases: [b.fases.b] });
    expect(await config(novo)).toEqual({ fill_phases: [b.fases.b] });
    expect(await config(sem)).toEqual({ currency: { code: "BRL" } });
  });
});
