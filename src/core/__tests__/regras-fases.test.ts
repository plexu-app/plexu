// Regras em várias fases (phase_ids) e "a partir da fase" (from_phase_id, por posição: fases criadas
// depois entram sozinhas). Sem fases definidas, a regra vale em todas.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { phases } from "../../db/schema";
import { createCard, moveCard, updateFields } from "../cards";
import { regraVale } from "../rules";
import { CoreError, type Actor } from "../types";
import { criarBoard, criarCampo, criarRegra, criarWorkspace } from "./fixtures";

let actor: Actor;
const B = { id: "", fases: {} as Record<string, string> };
const erro = (p: Promise<unknown>) => p.then(() => null, (e) => e as CoreError);

beforeAll(async () => {
  const w = await criarWorkspace();
  actor = w.actor;
  const b = await criarBoard(w.ws.id, "processos", [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }]);
  Object.assign(B, b);
  await criarCampo(b.id, { slug: "nota", type: "text" });
  await criarRegra({ boardId: b.id, kind: "can_enter", phaseIds: [b.fases.B, b.fases.D], expr: "false", message: "entrada bloqueada em B e D" });
  await criarRegra({ boardId: b.id, kind: "can_edit", fromPhaseId: b.fases.C, expr: "false", message: "nota congelada a partir de C" });
});

describe("regras com várias fases", () => {
  it("phase_ids: vale só nas fases listadas", async () => {
    const c = await createCard({ boardId: B.id, props: {}, actor });
    expect((await erro(moveCard({ cardId: c.id, toPhaseId: B.fases.B, actor })))?.message).toBe("entrada bloqueada em B e D");
    await moveCard({ cardId: c.id, toPhaseId: B.fases.C, actor });
    expect((await erro(moveCard({ cardId: c.id, toPhaseId: B.fases.D, actor })))?.message).toBe("entrada bloqueada em B e D");
  });

  it("from_phase_id: vale na fase e nas seguintes, inclusive em fase criada depois", async () => {
    const c = await createCard({ boardId: B.id, props: { nota: "a" }, actor });
    await updateFields({ cardId: c.id, props: { nota: "editada em A" }, actor });
    await moveCard({ cardId: c.id, toPhaseId: B.fases.C, actor });
    expect((await erro(updateFields({ cardId: c.id, props: { nota: "x" }, actor })))?.message).toBe("nota congelada a partir de C");
    const [e] = await db.insert(phases).values({ boardId: B.id, name: "E", position: 9 }).returning();
    const c2 = await createCard({ boardId: B.id, phaseId: e.id, props: {}, actor });
    expect((await erro(updateFields({ cardId: c2.id, props: { nota: "x" }, actor })))?.message).toBe("nota congelada a partir de C");
  });

  it("regraVale: todas, lista, a partir de; card sem fase só vê regra de todas as fases", () => {
    const q = { fasePorId: new Map([["a", { position: 0 }], ["b", { position: 1 }], ["c", { position: 2 }]] as [string, never][]) };
    expect(regraVale(q, { phaseIds: null, fromPhaseId: null }, "a")).toBe(true);
    expect(regraVale(q, { phaseIds: null, fromPhaseId: null }, null)).toBe(true);
    expect(regraVale(q, { phaseIds: ["a", "c"], fromPhaseId: null }, "b")).toBe(false);
    expect(regraVale(q, { phaseIds: ["a", "c"], fromPhaseId: null }, "c")).toBe(true);
    expect(regraVale(q, { phaseIds: null, fromPhaseId: "b" }, "a")).toBe(false);
    expect(regraVale(q, { phaseIds: null, fromPhaseId: "b" }, "c")).toBe(true);
    expect(regraVale(q, { phaseIds: ["a"], fromPhaseId: null }, null)).toBe(false);
  });
});
