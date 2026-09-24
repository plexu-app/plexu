// Integração: configuração de board contra Postgres real.
import { and, asc, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { events, phases } from "@/db/schema";
import { createCard } from "@/core";
import { criarWorkspace } from "@/core/__tests__/fixtures";
import { ErroConfig, criarBoard } from "../config";
import {
  ajustarCampoNaFase,
  arquivarCampo,
  arquivarFase,
  ativarRegra,
  criarCampo,
  criarFase,
  criarRegra,
  definirExibicaoKanban,
  editarCampo,
  moverFase,
  atualizarFase,
} from "../config-board";

type Alvo = { wsId: string; boardId: string; actor: { type: "user"; id: string } };
let alvo: Alvo;
let parcelas: Alvo;

async function erro(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroConfig) return e.message;
    throw e;
  }
  throw new Error("esperava ErroConfig");
}

beforeAll(async () => {
  const w = await criarWorkspace();
  const actor = { type: "user" as const, id: w.user.id };
  const { slug } = await criarBoard(w.ws.id, actor, { nome: "Contratos", kind: "workflow" });
  await criarBoard(w.ws.id, actor, { nome: "Parcelas", kind: "database" });
  const [b] = await db.execute<{ id: string }>(sql`select id from boards where workspace_id = ${w.ws.id} and slug = ${slug}`);
  const [p] = await db.execute<{ id: string }>(sql`select id from boards where workspace_id = ${w.ws.id} and slug = 'parcelas'`);
  alvo = { wsId: w.ws.id, boardId: b.id, actor };
  parcelas = { wsId: w.ws.id, boardId: p.id, actor };
});

const nomesFases = async () =>
  (await db.select({ n: phases.name }).from(phases).where(and(eq(phases.boardId, alvo.boardId), sql`${phases.archivedAt} is null`)).orderBy(asc(phases.position))).map(
    (x) => x.n,
  );

describe("fases", () => {
  it("cria, reordena (respeitando unique de posição) e arquiva só sem cards", async () => {
    expect(await nomesFases()).toEqual(["A fazer", "Em andamento", "Concluído"]);
    const f = await criarFase(alvo, "Suspenso");
    await moverFase(alvo, f.id, -1);
    expect(await nomesFases()).toEqual(["A fazer", "Em andamento", "Suspenso", "Concluído"]);
    await moverFase(alvo, f.id, -1);
    await moverFase(alvo, f.id, -1);
    await moverFase(alvo, f.id, -1); // já é a primeira: nada muda
    expect(await nomesFases()).toEqual(["Suspenso", "A fazer", "Em andamento", "Concluído"]);

    await createCard({ boardId: alvo.boardId, props: {}, actor: alvo.actor }); // cai na primeira fase (Suspenso)
    expect(await erro(arquivarFase(alvo, f.id))).toMatch(/card/);
    expect(await erro(criarFase(parcelas, "X"))).toMatch(/base/);
  });
});

describe("campos", () => {
  it("valida expressões e config; slug único; relação exclusiva cria índice", async () => {
    expect(await erro(criarCampo(alvo, { nome: "X", tipo: "text", config: {}, visibleExpr: "card.a >" }))).toMatch(/visível se/);
    expect(await erro(criarCampo(alvo, { nome: "Y", tipo: "select", config: { options: [] } }))).toMatch(/opção/);
    expect(await erro(criarCampo(alvo, { nome: "Z", slug: "1ruim", tipo: "text", config: {} }))).toMatch(/slug/);

    const rel = await criarCampo(alvo, { nome: "Parcelas", tipo: "relation", config: { relation: { target_board: parcelas.boardId, exclusive: true } } });
    expect(rel.slug).toBe("parcelas");
    const idx = await db.execute(sql`select 1 from pg_indexes where indexname = ${`card_links_excl_${rel.id.replace(/-/g, "")}`}`);
    expect(idx).toHaveLength(1);
    expect(await erro(criarCampo(alvo, { nome: "Outro", slug: "parcelas", tipo: "text", config: {} }))).toMatch(/já existe/);

    const soma = await criarCampo(alvo, { nome: "Total", tipo: "rollup", config: { rollup: { via_field: rel.id, agg: "sum", expr: "valor" } } });
    expect(soma.config).toEqual({ rollup: { via_field: rel.id, agg: "sum", expr: "valor" } });
    expect(await erro(criarCampo(alvo, { nome: "T2", tipo: "rollup", config: { rollup: { via_field: rel.id, agg: "count", filter_expr: "card." } } }))).toMatch(
      /filtro do rollup/,
    );

    await editarCampo(alvo, soma.id, { nome: "Total geral", slug: "total", tipo: "rollup", config: { rollup: { via_field: rel.id, agg: "count" } }, titulo: false });
    const [depois] = await db.execute<{ name: string; slug: string }>(sql`select name, slug from fields where id = ${soma.id}`);
    expect(depois).toEqual({ name: "Total geral", slug: "total" });

    const [b] = await db.execute<{ title_field_id: string }>(sql`select title_field_id from boards where id = ${alvo.boardId}`);
    expect(await erro(arquivarCampo(alvo, b.title_field_id))).toMatch(/título/);
    await arquivarCampo(alvo, soma.id);
  });

  it("ajuste por fase: grava e remove quando tudo volta ao padrão", async () => {
    const c = await criarCampo(alvo, { nome: "Obs", tipo: "text", config: {} });
    const [fase] = await db.select().from(phases).where(eq(phases.boardId, alvo.boardId)).limit(1);
    await ajustarCampoNaFase(alvo, c.id, fase.id, { visible: null, editable: false, required: true });
    let rows = await db.execute(sql`select editable, required from field_phase_settings where field_id = ${c.id}`);
    expect(rows).toEqual([{ editable: false, required: true }]);
    await ajustarCampoNaFase(alvo, c.id, fase.id, { visible: null, editable: null, required: null });
    rows = await db.execute(sql`select 1 from field_phase_settings where field_id = ${c.id}`);
    expect(rows).toHaveLength(0);
  });
});

describe("regras", () => {
  it("valida CEL e tipo; desativar em vez de apagar; tudo registra config.changed", async () => {
    expect(await erro(criarRegra(alvo, { kind: "can_leave", expr: "filhos(" }))).toMatch(/expressão/);
    expect(await erro(criarRegra(alvo, { kind: "can_fly", expr: "true" }))).toMatch(/tipo/);
    const r = await criarRegra(alvo, { kind: "can_back", expr: "true", onFail: "keep", message: " ok " });
    expect(r.onFail).toEqual({ children: "keep" });
    expect(r.message).toBe("ok");
    await ativarRegra(alvo, r.id, false);
    const [x] = await db.execute<{ enabled: boolean }>(sql`select enabled from rules where id = ${r.id}`);
    expect(x.enabled).toBe(false);

    const ev = await db.select({ data: events.data }).from(events).where(and(eq(events.boardId, alvo.boardId), eq(events.type, "config.changed")));
    const entidades = new Set(ev.map((e) => (e.data as { entidade: string }).entidade));
    expect([...entidades].sort()).toEqual(["board", "field", "field_phase_settings", "phase", "rule"]);
  });
});

describe("exibição", () => {
  it("cor da fase valida #rrggbb e pode ser limpa", async () => {
    const [f] = await db.select().from(phases).where(eq(phases.boardId, alvo.boardId)).limit(1);
    await atualizarFase(alvo, f.id, { cor: "#3B5BFF" });
    let [x] = await db.select({ c: phases.color }).from(phases).where(eq(phases.id, f.id));
    expect(x.c).toBe("#3B5BFF");
    expect(await erro(atualizarFase(alvo, f.id, { cor: "azul" }))).toMatch(/cor/);
    await atualizarFase(alvo, f.id, { cor: null });
    [x] = await db.select({ c: phases.color }).from(phases).where(eq(phases.id, f.id));
    expect(x.c).toBeNull();
  });

  it("campos do cartão (até 3, do board) e prazo só de data; mescla em settings", async () => {
    const t = await criarCampo(alvo, { nome: "Nota", tipo: "text", config: {} });
    const d = await criarCampo(alvo, { nome: "Prazo", tipo: "date", config: {} });
    await definirExibicaoKanban(alvo, { campos: [t.id, t.id, d.id], prazo: d.id });
    const [b] = await db.execute<{ settings: Record<string, unknown> }>(sql`select settings from boards where id = ${alvo.boardId}`);
    expect(b.settings).toMatchObject({ kanban_fields: [t.id, d.id], kanban_due_field: d.id });
    expect(await erro(definirExibicaoKanban(alvo, { campos: [], prazo: t.id }))).toMatch(/data/);
    expect(await erro(definirExibicaoKanban(alvo, { campos: [parcelas.boardId], prazo: null }))).toMatch(/não pertence/);
  });
});
