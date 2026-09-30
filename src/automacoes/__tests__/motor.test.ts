// Motor de automações: gatilhos (a partir de events), condição, passos, execução (log, tentativas),
// ambientes e proteção contra loop. Efeitos externos com dublês.
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCard, linkCards, moveCard, updateFields, type Actor } from "@/core";
import { criarBoard, criarCampo, criarRegra, criarWorkspace, definirTitulo } from "@/core/__tests__/fixtures";
import { db } from "@/db";
import { automationRuns, automations, cardComments, cards, connections, events } from "@/db/schema";
import type { Efeitos, RequisicaoHttp, RespostaHttp } from "../efeitos";
import { despacharEventos, MAX_PROFUNDIDADE, varrerAgendadas } from "../despacho";
import { executarRun, MAX_TENTATIVAS } from "../executor";
import { gravarVariavel } from "../segredos";

process.env.APP_SECRET ??= "segredo-de-teste-com-mais-de-16-caracteres";

const workspaces: string[] = [];

/** Workspace com contratos (fases) → parcelas (fases) e campos usados nos testes. */
async function montar() {
  const w = await criarWorkspace();
  workspaces.push(w.ws.id);
  const c = await criarBoard(w.ws.id, "contratos", [{ name: "Rascunho" }, { name: "Vigente" }, { name: "Encerrado", terminal: true }]);
  const p = await criarBoard(w.ws.id, "parcelas", [{ name: "Aberta" }, { name: "Paga", terminal: true }]);
  const f = {
    objeto: await criarCampo(c.id, { slug: "objeto", type: "text" }),
    valor: await criarCampo(c.id, { slug: "valor", type: "number" }),
    obs: await criarCampo(c.id, { slug: "obs", type: "text" }),
    status: await criarCampo(c.id, { slug: "situacao", type: "text" }),
    prazo: await criarCampo(c.id, { slug: "prazo", type: "date" }),
    a: await criarCampo(c.id, { slug: "a", type: "number" }),
    b: await criarCampo(c.id, { slug: "b", type: "number" }),
    parcelas: await criarCampo(c.id, { slug: "parcelas", type: "relation", config: { relation: { target_board: p.id, cardinality: "many", inverse_name: "contrato" } } }),
    pvalor: await criarCampo(p.id, { slug: "valor", type: "number" }),
    pdesc: await criarCampo(p.id, { slug: "descricao", type: "text" }),
  };
  await definirTitulo(c.id, f.objeto);
  await definirTitulo(p.id, f.pdesc);
  return { ...w, c, p, f };
}
type Montado = Awaited<ReturnType<typeof montar>>;

async function automacao(m: Montado, a: { trigger: unknown; steps: unknown[]; condition?: string; env?: "draft" | "test" | "published"; suppress?: boolean; board?: string; updatedAt?: Date }) {
  const [row] = await db
    .insert(automations)
    .values({
      workspaceId: m.ws.id,
      boardId: a.board ?? m.c.id,
      name: "auto",
      trigger: a.trigger,
      conditionExpr: a.condition ?? null,
      steps: a.steps,
      env: a.env ?? "published",
      suppressTriggers: a.suppress ?? false,
      ...(a.updatedAt ? { updatedAt: a.updatedAt, createdAt: a.updatedAt } : {}),
    })
    .returning();
  return row.id;
}

function dubles() {
  const chamadas = { email: [] as { to: string; subject: string; text: string }[], http: [] as RequisicaoHttp[] };
  const estado = { resposta: { status: 200, headers: { "content-type": "application/json" }, body: '{"ok":true}' } as RespostaHttp };
  const efeitos: Efeitos = {
    email: async (_s, msg) => {
      chamadas.email.push(msg);
      return { id: "msg-1" };
    },
    http: async (r) => {
      chamadas.http.push(r);
      return estado.resposta;
    },
  };
  return { chamadas, estado, efeitos };
}

/** Despacha e executa até esvaziar (cascatas incluídas). */
async function processar(efeitos?: Efeitos) {
  for (let i = 0; i < 20; i++) {
    const ids = await despacharEventos(5000);
    if (!ids.length) return;
    for (const id of ids) await executarRun(id, { efeitos });
  }
}

const runsDe = (automationId: string) => db.select().from(automationRuns).where(eq(automationRuns.automationId, automationId)).orderBy(automationRuns.createdAt);
const card = async (id: string) => (await db.select().from(cards).where(eq(cards.id, id)))[0];
const novoContrato = (m: Montado, props: Record<string, unknown> = {}) => createCard({ boardId: m.c.id, props: { objeto: "Obra", ...props }, actor: m.actor });

afterAll(async () => {
  if (workspaces.length) await db.update(automations).set({ archivedAt: new Date() }).where(inArray(automations.workspaceId, workspaces));
});

describe("gatilhos a partir de events", () => {
  let m: Montado;
  beforeAll(async () => {
    m = await montar();
  });

  it("card_created: set_field literal e expressão, comentário; ator automação; eventos marcados com a execução", async () => {
    const id = await automacao(m, {
      trigger: { type: "card_created" },
      steps: [
        { type: "set_field", field: m.f.status, value: "novo" },
        { type: "set_field", field: m.f.valor, expr: "card.a * 2" },
        { type: "add_comment", body: "Criado: {{ card.objeto }} ({{ card.situacao }})" },
      ],
    });
    const c = await novoContrato(m, { a: 21 });
    await processar();
    const [run] = await runsDe(id);
    expect(run).toMatchObject({ status: "success", cardId: c.id, attempt: 1, env: "published" });
    expect((run.log as { status: string }[]).map((l) => l.status)).toEqual(["ok", "ok", "ok"]);
    const x = await card(c.id);
    expect(x.props[m.f.status]).toBe("novo");
    expect(x.props[m.f.valor]).toBe(42);
    const [com] = await db.select().from(cardComments).where(eq(cardComments.cardId, c.id));
    expect(com).toMatchObject({ body: "Criado: Obra (novo)", source: "automation", authorId: null });
    const evs = await db.select().from(events).where(and(eq(events.cardId, c.id), eq(events.type, "card.field_updated")));
    expect(evs.every((e) => e.automationRunId === run.id && e.actorType === "automation" && e.actorId === id)).toBe(true);
    // Evento do usuário (criação) não tem execução
    const [criado] = await db.select().from(events).where(and(eq(events.cardId, c.id), eq(events.type, "card.created")));
    expect(criado.automationRunId).toBeNull();
    await db.update(automations).set({ archivedAt: new Date() }).where(eq(automations.id, id));
  });

  it("card_entered_phase e card_left_phase; condição com fase_origem", async () => {
    const entrou = await automacao(m, { trigger: { type: "card_entered_phase", phase: m.c.fases.Vigente }, steps: [{ type: "set_field", field: m.f.obs, value: "entrou" }] });
    const saiu = await automacao(m, {
      trigger: { type: "card_left_phase", phase: m.c.fases.Vigente },
      condition: 'fase_origem == "Vigente" && fase_destino == "Encerrado"',
      steps: [{ type: "set_field", field: m.f.status, value: "encerrado" }],
    });
    const c = await novoContrato(m);
    await moveCard({ cardId: c.id, toPhaseId: m.c.fases.Vigente, actor: m.actor });
    await processar();
    expect((await card(c.id)).props[m.f.obs]).toBe("entrou");
    await moveCard({ cardId: c.id, toPhaseId: m.c.fases.Rascunho, actor: m.actor });
    await processar();
    expect((await runsDe(saiu)).at(-1)).toMatchObject({ status: "skipped" }); // Vigente → Rascunho: condição falsa
    await moveCard({ cardId: c.id, toPhaseId: m.c.fases.Vigente, actor: m.actor });
    await moveCard({ cardId: c.id, toPhaseId: m.c.fases.Encerrado, actor: m.actor });
    await processar();
    expect((await card(c.id)).props[m.f.status]).toBe("encerrado");
    expect((await runsDe(entrou)).filter((r) => r.cardId === c.id)).toHaveLength(2);
    await db.update(automations).set({ archivedAt: new Date() }).where(inArray(automations.id, [entrou, saiu]));
  });

  it("field_updated: só os campos listados; vários campos na mesma escrita = um disparo", async () => {
    const id = await automacao(m, { trigger: { type: "field_updated", fields: [m.f.a, m.f.b] }, steps: [{ type: "set_field", field: m.f.obs, expr: '"a+b=" + string(card.a + card.b)' }] });
    const c = await novoContrato(m, { a: 1, b: 1 });
    await processar(); // criação não é field_updated
    expect(await runsDe(id)).toHaveLength(0);
    await updateFields({ cardId: c.id, props: { a: 2, b: 3 }, actor: m.actor });
    await processar();
    await updateFields({ cardId: c.id, props: { situacao: "x" }, actor: m.actor });
    await processar();
    const runs = await runsDe(id);
    expect(runs).toHaveLength(1);
    expect((await card(c.id)).props[m.f.obs]).toBe("a+b=5");
    await db.update(automations).set({ archivedAt: new Date() }).where(eq(automations.id, id));
  });

  it("all_children_in_phase: dispara no pai quando o último filho entra na fase", async () => {
    const id = await automacao(m, { trigger: { type: "all_children_in_phase", relation: m.f.parcelas, phase: m.p.fases.Paga }, steps: [{ type: "move_card", phase: m.c.fases.Encerrado }] });
    const c = await novoContrato(m);
    const p1 = await createCard({ boardId: m.p.id, props: { descricao: "1" }, actor: m.actor });
    const p2 = await createCard({ boardId: m.p.id, props: { descricao: "2" }, actor: m.actor });
    for (const p of [p1, p2]) await linkCards({ fieldId: "parcelas", fromCardId: c.id, toCardId: p.id, actor: m.actor });
    await moveCard({ cardId: p1.id, toPhaseId: m.p.fases.Paga, actor: m.actor });
    await processar();
    expect(await runsDe(id)).toHaveLength(0);
    await moveCard({ cardId: p2.id, toPhaseId: m.p.fases.Paga, actor: m.actor });
    await processar();
    const [run] = await runsDe(id);
    expect(run).toMatchObject({ status: "success", cardId: c.id });
    expect((await card(c.id)).phaseId).toBe(m.c.fases.Encerrado);
    await db.update(automations).set({ archivedAt: new Date() }).where(eq(automations.id, id));
  });

  it("rascunho não dispara; automação arquivada não dispara", async () => {
    const rascunho = await automacao(m, { trigger: { type: "card_created" }, env: "draft", steps: [{ type: "set_field", field: m.f.obs, value: "x" }] });
    await novoContrato(m);
    await processar();
    expect(await runsDe(rascunho)).toHaveLength(0);
  });
});

describe("agendados", () => {
  it("campo de data ± N dias na hora: uma execução por card e data; repetir a varredura não duplica", async () => {
    const m = await montar();
    const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const em3 = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const id = await automacao(m, {
      trigger: { type: "scheduled", date_field: m.f.prazo, offset_days: -3, time: "00:00" },
      steps: [{ type: "add_comment", body: "Vence em 3 dias ({{ card.prazo }})" }],
      updatedAt: new Date(Date.now() - 2 * 86_400_000),
    });
    const vence = await novoContrato(m, { prazo: em3 });
    await novoContrato(m, { prazo: hoje });
    const ids = await varrerAgendadas();
    const meus = (await runsDe(id)).filter((r) => ids.includes(r.id));
    expect(meus.map((r) => r.cardId)).toEqual([vence.id]);
    for (const r of meus) await executarRun(r.id);
    expect((await varrerAgendadas()).filter((x) => meus.some((r) => r.id === x))).toEqual([]);
    expect(await runsDe(id)).toHaveLength(1);
    const [com] = await db.select().from(cardComments).where(eq(cardComments.cardId, vence.id));
    expect(com.body).toBe(`Vence em 3 dias (${em3})`);
  });

  it("cron: uma execução por instante desde a publicação (sem card); sem duplicar", async () => {
    const m = await montar();
    const d = dubles();
    const agora = new Date();
    const id = await automacao(m, {
      trigger: { type: "scheduled", cron: "* * * * *" },
      steps: [{ type: "http_request", method: "POST", url: "https://exemplo.test/ping", body: '{"n": {{ 1 + 1 }}}' }],
      updatedAt: new Date(agora.getTime() - 3 * 60_000 - 1000),
    });
    await varrerAgendadas(agora);
    await varrerAgendadas(agora);
    const runs = await runsDe(id);
    expect(runs).toHaveLength(3);
    expect(runs.every((r) => r.cardId === null && r.dedupeKey?.startsWith("cron:"))).toBe(true);
    await executarRun(runs[0].id, { efeitos: d.efeitos });
    expect(d.chamadas.http[0]).toMatchObject({ method: "POST", url: "https://exemplo.test/ping", body: '{"n": 2}' });
  });
});

describe("passos", () => {
  let m: Montado;
  beforeAll(async () => {
    m = await montar();
  });

  it("create_related_card: relação dos dois lados e mapeamento com expressões", async () => {
    const id = await automacao(m, {
      trigger: { type: "card_created" },
      steps: [
        // relação no board de origem (contratos.parcelas): o contrato aponta para a parcela nova
        { type: "create_related_card", board: m.p.id, relation: m.f.parcelas, fields: { [m.f.pvalor]: "card.valor / 2", [m.f.pdesc]: '"1/2 de " + card.objeto' } },
      ],
    });
    const c = await novoContrato(m, { valor: 1000 });
    await processar();
    const [run] = await runsDe(id);
    expect(run.status).toBe("success");
    const novoId = (run.log as { detalhe: { card: string } }[])[0].detalhe.card;
    const p = await card(novoId);
    expect(p.props).toMatchObject({ [m.f.pvalor]: 500, [m.f.pdesc]: "1/2 de Obra" });
    const ligs = await db.execute<{ n: number }>(sql`select count(*)::int n from card_links where field_id = ${m.f.parcelas} and from_card_id = ${c.id} and to_card_id = ${novoId}`);
    expect(ligs[0].n).toBe(1);
    await db.update(automations).set({ archivedAt: new Date() }).where(eq(automations.id, id));
  });

  it("send_email: sem SMTP fica 'não enviado' (e segue); com SMTP envia o modelo; variáveis", async () => {
    const d = dubles();
    await gravarVariavel(m.ws.id, "EQUIPE", "equipe@exemplo.test", false);
    const id = await automacao(m, {
      trigger: { type: "card_created" },
      steps: [
        { type: "send_email", to: "{{ var.EQUIPE }}", subject: "Novo: {{ card.objeto }}", body: "Valor {{ card.valor }}" },
        { type: "set_field", field: m.f.obs, value: "depois do e-mail" },
      ],
    });
    const c1 = await novoContrato(m, { valor: 10 });
    await processar(d.efeitos);
    const [r1] = await runsDe(id);
    expect(r1.status).toBe("success");
    expect((r1.log as { status: string }[])[0].status).toBe("nao_enviado");
    expect((await card(c1.id)).props[m.f.obs]).toBe("depois do e-mail");
    expect(d.chamadas.email).toHaveLength(0);

    await db.insert(connections).values({ workspaceId: m.ws.id, name: "SMTP", type: "smtp", config: { host: "smtp.exemplo.test", port: 587, from: "plexu@exemplo.test" } });
    await novoContrato(m, { objeto: "Reforma", valor: 20 });
    await processar(d.efeitos);
    expect(d.chamadas.email).toEqual([{ to: "equipe@exemplo.test", subject: "Novo: Reforma", text: "Valor 20" }]);
    await db.update(automations).set({ archivedAt: new Date() }).where(eq(automations.id, id));
  });

  it("http_request: segredo no header chega ao destino e sai mascarado do log; resposta gravada; 4xx falha; 5xx tenta de novo e vira dead", async () => {
    const d = dubles();
    await gravarVariavel(m.ws.id, "TOKEN", "tok-super-secreto", true);
    const id = await automacao(m, {
      trigger: { type: "card_created" },
      steps: [{ type: "http_request", method: "POST", url: "https://erp.exemplo.test/contratos", headers: { Authorization: "Bearer {{ var.TOKEN }}" }, body: '{"objeto": "{{ card.objeto }}"}' }],
    });
    await novoContrato(m);
    await processar(d.efeitos);
    expect(d.chamadas.http[0].headers.Authorization).toBe("Bearer tok-super-secreto");
    const [ok] = await runsDe(id);
    expect(ok.status).toBe("success");
    expect(JSON.stringify(ok.log)).not.toContain("tok-super-secreto");
    expect(ok.log).toMatchObject([{ detalhe: { requisicao: { headers: { Authorization: "Bearer ••••" } }, resposta: { status: 200, corpo: '{"ok":true}' } } }]);

    d.estado.resposta = { status: 404, headers: {}, body: "não achei" };
    await novoContrato(m);
    await processar(d.efeitos);
    expect((await runsDe(id)).at(-1)).toMatchObject({ status: "failed", error: "passo 1 (http_request): HTTP 404", attempt: 1 });

    d.estado.resposta = { status: 503, headers: {}, body: "fora" };
    await novoContrato(m);
    await processar(d.efeitos);
    let r = (await runsDe(id)).at(-1)!;
    expect(r).toMatchObject({ status: "queued", attempt: 2 });
    for (let i = 2; i <= MAX_TENTATIVAS; i++) await executarRun(r.id, { efeitos: d.efeitos });
    r = (await runsDe(id)).at(-1)!;
    expect(r.status).toBe("dead");
    expect(r.attempt).toBe(MAX_TENTATIVAS);
    await db.update(automations).set({ archivedAt: new Date() }).where(eq(automations.id, id));
  });

  it("para no primeiro erro e desfaz os passos anteriores (execução atômica); regra do core vale", async () => {
    await criarRegra({ boardId: m.c.id, kind: "can_enter", phaseId: m.c.fases.Encerrado, expr: "card.valor != null && card.valor > 0", message: "sem valor não encerra" });
    const id = await automacao(m, {
      trigger: { type: "card_created" },
      steps: [
        { type: "set_field", field: m.f.obs, value: "primeiro" },
        { type: "move_card", phase: m.c.fases.Encerrado },
        { type: "set_field", field: m.f.status, value: "nunca" },
      ],
    });
    const c = await novoContrato(m);
    await processar();
    const [r] = await runsDe(id);
    expect(r).toMatchObject({ status: "failed", error: "passo 2 (move_card): sem valor não encerra" });
    expect((r.log as { status: string }[]).map((l) => l.status)).toEqual(["ok", "erro"]);
    const x = await card(c.id);
    expect(x.props[m.f.obs]).toBeUndefined();
    expect(x.props[m.f.status]).toBeUndefined();
    await db.update(automations).set({ archivedAt: new Date() }).where(eq(automations.id, id));
  });
});

describe("ambiente de teste", () => {
  it("executa e loga, mas desfaz tudo; e-mail e HTTP simulados; não dispara cascata", async () => {
    const m = await montar();
    const d = dubles();
    await db.insert(connections).values({ workspaceId: m.ws.id, name: "SMTP", type: "smtp", config: { host: "smtp.exemplo.test", from: "a@b.test" } });
    const id = await automacao(m, {
      env: "test",
      trigger: { type: "card_created" },
      steps: [
        { type: "set_field", field: m.f.obs, value: "simulado" },
        { type: "send_email", to: "x@y.test", subject: "s", body: "b" },
        { type: "http_request", method: "GET", url: "https://exemplo.test/" },
      ],
    });
    const outra = await automacao(m, { trigger: { type: "field_updated", fields: [m.f.obs] }, steps: [{ type: "set_field", field: m.f.status, value: "cascata" }] });
    const c = await novoContrato(m);
    await processar(d.efeitos);
    const [r] = await runsDe(id);
    expect(r).toMatchObject({ status: "success", env: "test" });
    expect((r.log as { status: string }[]).map((l) => l.status)).toEqual(["ok", "simulado", "simulado", "info"]);
    expect(d.chamadas).toEqual({ email: [], http: [] });
    expect((await card(c.id)).props[m.f.obs]).toBeUndefined();
    expect(await runsDe(outra)).toHaveLength(0);
  });
});

describe("proteção contra loop", () => {
  it("a automação não dispara a si mesma no mesmo ciclo", async () => {
    const m = await montar();
    const id = await automacao(m, { trigger: { type: "field_updated", fields: [m.f.a] }, steps: [{ type: "set_field", field: m.f.a, expr: "card.a + 1" }] });
    const c = await novoContrato(m, { a: 0 });
    await updateFields({ cardId: c.id, props: { a: 1 }, actor: m.actor });
    await processar();
    const runs = await runsDe(id);
    expect(runs.map((r) => r.status)).toEqual(["success", "skipped"]);
    expect(runs[1].error).toMatch(/já rodou neste ciclo/);
    expect((await card(c.id)).props[m.f.a]).toBe(2);
  });

  it("ciclo A → B → A para no segundo A", async () => {
    const m = await montar();
    const a = await automacao(m, { trigger: { type: "field_updated", fields: [m.f.a] }, steps: [{ type: "set_field", field: m.f.b, expr: "card.a" }] });
    const b = await automacao(m, { trigger: { type: "field_updated", fields: [m.f.b] }, steps: [{ type: "set_field", field: m.f.a, expr: "card.b + 1" }] });
    const c = await novoContrato(m);
    await updateFields({ cardId: c.id, props: { a: 1 }, actor: m.actor });
    await processar();
    expect((await runsDe(a)).map((r) => r.status)).toEqual(["success", "skipped"]);
    expect((await runsDe(b)).map((r) => r.status)).toEqual(["success"]);
    expect((await card(c.id)).props).toMatchObject({ [m.f.a]: 2, [m.f.b]: 1 });
  });

  it(`profundidade máxima de cascata (${MAX_PROFUNDIDADE})`, async () => {
    const m = await montar();
    // Cadeia de campos: n0 → n1 → ... cada automação copia o anterior no próximo.
    const n: string[] = [];
    for (let i = 0; i <= MAX_PROFUNDIDADE + 2; i++) n.push(await criarCampo(m.c.id, { slug: `n${i}`, type: "number" }));
    const autos: string[] = [];
    for (let i = 0; i < n.length - 1; i++) autos.push(await automacao(m, { trigger: { type: "field_updated", fields: [n[i]] }, steps: [{ type: "set_field", field: n[i + 1], expr: `card.n${i}` }] }));
    const c = await novoContrato(m);
    await updateFields({ cardId: c.id, props: { n0: 7 }, actor: m.actor });
    await processar();
    const status = await Promise.all(autos.map(async (x) => (await runsDe(x)).map((r) => r.status).join(",")));
    expect(status.slice(0, MAX_PROFUNDIDADE + 1)).toEqual(Array(MAX_PROFUNDIDADE + 1).fill("success"));
    expect(status[MAX_PROFUNDIDADE + 1]).toBe("skipped");
    const x = await card(c.id);
    expect(x.props[n[MAX_PROFUNDIDADE + 1]]).toBe(7);
    expect(x.props[n[MAX_PROFUNDIDADE + 2]]).toBeUndefined();
  });

  it("suppress_triggers: o que a automação escreve não dispara outras", async () => {
    const m = await montar();
    await automacao(m, { trigger: { type: "card_created" }, suppress: true, steps: [{ type: "set_field", field: m.f.a, value: 5 }] });
    const ouvinte = await automacao(m, { trigger: { type: "field_updated", fields: [m.f.a] }, steps: [{ type: "set_field", field: m.f.b, value: 1 }] });
    const c = await novoContrato(m);
    await processar();
    expect((await card(c.id)).props[m.f.a]).toBe(5);
    expect(await runsDe(ouvinte)).toHaveLength(0);
    // Escrita do usuário continua disparando
    await updateFields({ cardId: c.id, props: { a: 6 }, actor: m.actor });
    await processar();
    expect(await runsDe(ouvinte)).toHaveLength(1);
  });
});

describe("execução", () => {
  it("é reivindicada uma vez só; card excluído vira skipped", async () => {
    const m = await montar();
    const actor: Actor = m.actor;
    const id = await automacao(m, { trigger: { type: "card_created" }, steps: [{ type: "set_field", field: m.f.obs, value: "x" }] });
    const c = await novoContrato(m);
    const ids = await despacharEventos(5000);
    const meu = (await runsDe(id))[0];
    expect(ids).toContain(meu.id);
    const { deleteCard } = await import("@/core");
    await deleteCard({ cardId: c.id, actor });
    const [r1, r2] = await Promise.all([executarRun(meu.id), executarRun(meu.id)]);
    expect([r1, r2].filter(Boolean)).toHaveLength(1);
    expect((await runsDe(id))[0]).toMatchObject({ status: "skipped", error: "card excluído" });
  });
});

describe("alvo do passo: pai e filhos via relação", () => {
  it("parcela paga move o contrato (pai) e comenta nele; contrato vigente preenche as parcelas (filhos)", async () => {
    const m = await montar();
    const noPai = await automacao(m, {
      board: m.p.id,
      trigger: { type: "card_entered_phase", phase: m.p.fases.Paga },
      steps: [
        { type: "move_card", phase: m.c.fases.Vigente, target: { type: "parent", relation: m.f.parcelas } },
        { type: "add_comment", body: "Parcela {{ card.descricao }} paga", target: { type: "parent", relation: m.f.parcelas } },
      ],
    });
    const nosFilhos = await automacao(m, {
      trigger: { type: "card_entered_phase", phase: m.c.fases.Vigente },
      steps: [{ type: "set_field", field: m.f.pvalor, expr: "card.valor", target: { type: "children", relation: m.f.parcelas } }],
    });
    const c = await novoContrato(m, { valor: 900 });
    const p1 = await createCard({ boardId: m.p.id, props: { descricao: "1/2" }, actor: m.actor });
    const p2 = await createCard({ boardId: m.p.id, props: { descricao: "2/2" }, actor: m.actor });
    for (const p of [p1, p2]) await linkCards({ fieldId: "parcelas", fromCardId: c.id, toCardId: p.id, actor: m.actor });

    await moveCard({ cardId: p1.id, toPhaseId: m.p.fases.Paga, actor: m.actor });
    await processar();
    const [r] = await runsDe(noPai);
    expect(r).toMatchObject({ status: "success", cardId: p1.id });
    expect(r.log).toMatchObject([{ detalhe: { alvo: "pai", cards: [c.id] } }, { detalhe: { alvo: "pai", cards: [c.id] } }]);
    expect((await card(c.id)).phaseId).toBe(m.c.fases.Vigente);
    const [com] = await db.select().from(cardComments).where(eq(cardComments.cardId, c.id));
    expect(com.body).toBe("Parcela 1/2 paga"); // modelo avaliado no card do gatilho

    // Cascata: o contrato entrou em Vigente → preenche o valor nas duas parcelas (filhos)
    const [r2] = await runsDe(nosFilhos);
    expect(r2).toMatchObject({ status: "success", cardId: c.id });
    for (const p of [p1, p2]) expect((await card(p.id)).props[m.f.pvalor]).toBe(900);
  });

  it("sem card ligado no papel pedido: o passo registra que não havia alvo e a execução segue", async () => {
    const m = await montar();
    const id = await automacao(m, {
      board: m.p.id,
      trigger: { type: "card_created" },
      steps: [
        { type: "move_card", phase: m.c.fases.Vigente, target: { type: "parent", relation: m.f.parcelas } },
        { type: "set_field", field: m.f.pdesc, value: "sem contrato" },
      ],
    });
    const p = await createCard({ boardId: m.p.id, props: { descricao: "solta" }, actor: m.actor });
    await processar();
    const [r] = await runsDe(id);
    expect(r.status).toBe("success");
    expect(r.log).toMatchObject([{ status: "info", mensagem: "nenhum card pai ligado: nada a fazer" }, { status: "ok" }]);
    expect((await card(p.id)).props[m.f.pdesc]).toBe("sem contrato");
  });
});
