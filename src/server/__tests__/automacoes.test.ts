// Camada de servidor das automações e ações: validação de referências, teste com card (simulação),
// reexecução, ações (visibilidade, mini-form, regras do usuário), variáveis e SMTP.
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createCard } from "@/core";
import { criarBoard, criarCampo, criarRegra, criarWorkspace, definirTitulo } from "@/core/__tests__/fixtures";
import { db } from "@/db";
import { cardComments, cards, events, variables } from "@/db/schema";
import {
  acoesDoCard,
  automacoesDoBoard,
  estruturaParaAutomacoes,
  executarAcao,
  execucoesDoBoard,
  reexecutar,
  salvarAcao,
  salvarAutomacao,
  salvarSmtp,
  salvarVariavel,
  smtpDoWorkspaceUI,
  testarAutomacao,
  variaveisDoWorkspace,
} from "../automacoes";
import { ErroConfig } from "../config";

process.env.APP_SECRET ??= "segredo-de-teste-com-mais-de-16-caracteres";

let w: Awaited<ReturnType<typeof criarWorkspace>>;
const B = { id: "", fases: {} as Record<string, string>, f: {} as Record<string, string>, outro: "", outraFase: "" };
const alvo = () => ({ wsId: w.ws.id, boardId: B.id, actor: w.actor });
const erro = (p: Promise<unknown>) => p.then(() => null, (e) => (e instanceof ErroConfig ? e.message : String(e)));

beforeAll(async () => {
  w = await criarWorkspace();
  const b = await criarBoard(w.ws.id, "pedidos", [{ name: "Novo" }, { name: "Aprovado" }]);
  Object.assign(B, { id: b.id, fases: b.fases });
  B.f.titulo = await criarCampo(b.id, { slug: "titulo", type: "text" });
  B.f.valor = await criarCampo(b.id, { slug: "valor", type: "number" });
  B.f.obs = await criarCampo(b.id, { slug: "obs", type: "text" });
  B.f.total = await criarCampo(b.id, { slug: "total", type: "dynamic_text", config: { dynamic_text: { template: "{card.valor}" } } });
  await definirTitulo(b.id, B.f.titulo);
  const o = await criarBoard(w.ws.id, "outro", [{ name: "X" }]);
  B.outro = o.id;
  B.outraFase = o.fases.X;
});

describe("salvarAutomacao", () => {
  it("recusa referências de outro board, campo calculado e formato inválido", async () => {
    const base = { nome: "a", env: "published" as const, trigger: { type: "card_created" }, steps: [{ type: "move_card", phase: B.fases.Aprovado }] };
    expect(await erro(salvarAutomacao(alvo(), null, { ...base, steps: [{ type: "move_card", phase: B.outraFase }] }))).toMatch(/passo 1: fase não encontrada/);
    expect(await erro(salvarAutomacao(alvo(), null, { ...base, steps: [{ type: "set_field", field: B.f.total, value: "x" }] }))).toMatch(/calculado/);
    expect(await erro(salvarAutomacao(alvo(), null, { ...base, trigger: { type: "card_entered_phase", phase: B.outraFase } }))).toMatch(/gatilho: fase/);
    expect(await erro(salvarAutomacao(alvo(), null, { ...base, condicao: "card.valor >" }))).toMatch(/condição/);
    expect(await erro(salvarAutomacao(alvo(), null, { ...base, steps: [] }))).toMatch(/ao menos um passo/);
    expect(await erro(salvarAutomacao(alvo(), null, { ...base, trigger: { type: "scheduled", date_field: B.f.obs } }))).toMatch(/data/);
  });

  it("cria, lista com última execução e testa com card sem gravar nada", async () => {
    const id = await salvarAutomacao(alvo(), null, {
      nome: "Aprovar grande",
      env: "draft",
      trigger: { type: "card_created" },
      condicao: "card.valor > 100",
      steps: [
        { type: "set_field", field: B.f.obs, value: "aprovado automaticamente" },
        { type: "move_card", phase: B.fases.Aprovado },
        { type: "add_comment", body: "Aprovado: {{ card.titulo }}" },
      ],
    });
    const c = await createCard({ boardId: B.id, props: { titulo: "Notebook", valor: 500 }, actor: w.actor });
    const r = await testarAutomacao(alvo(), id, c.id);
    expect(r).toMatchObject({ status: "success", env: "test" });
    expect((r.log as { status: string }[]).map((l) => l.status)).toEqual(["info", "ok", "ok", "ok", "info"]);
    const [x] = await db.select().from(cards).where(eq(cards.id, c.id));
    expect(x.phaseId).toBe(B.fases.Novo);
    expect(x.props[B.f.obs]).toBeUndefined();
    expect(await db.select().from(cardComments).where(eq(cardComments.cardId, c.id))).toHaveLength(0);
    const [lista] = (await automacoesDoBoard(B.id)).filter((a) => a.id === id);
    expect(lista).toMatchObject({ env: "draft", ultima: { status: "success" } });

    // Reexecutar: nova execução com o mesmo card e ambiente
    const r2 = await reexecutar(alvo(), r.id);
    expect(r2).toMatchObject({ status: "success", env: "test", cardId: c.id });
    expect(r2.id).not.toBe(r.id);
    expect((await execucoesDoBoard(B.id, { automacao: id })).map((e) => e.gatilho)).toEqual(["manual", "manual"]);
  });

  it("registra config.changed", async () => {
    const evs = await db.select().from(events).where(eq(events.workspaceId, w.ws.id));
    expect(evs.some((e) => e.type === "config.changed" && (e.data as { entidade: string }).entidade === "automation")).toBe(true);
  });
});

describe("ações", () => {
  it("visible_expr, mini-form (obrigatório, número) e passos com form.*; regras valem para quem clica", async () => {
    await criarRegra({ boardId: B.id, kind: "can_enter", phaseId: B.fases.Aprovado, expr: 'usuario.email.endsWith("@teste.dev")', message: "só a equipe aprova" });
    const id = await salvarAcao(alvo(), null, {
      nome: "Registrar valor",
      visivel: "card.valor == null || card.valor < 1000",
      form: [
        { key: "novo_valor", label: "Novo valor", type: "number", required: true },
        { key: "nota", label: "Nota", type: "text" },
      ],
      steps: [
        { type: "set_field", field: B.f.valor, expr: "form.novo_valor" },
        { type: "add_comment", body: "Valor registrado: {{ form.novo_valor }} {{ form.nota }}" },
        { type: "move_card", phase: B.fases.Aprovado },
      ],
    });
    const c = await createCard({ boardId: B.id, props: { titulo: "Cadeira", valor: 10 }, actor: w.actor });
    expect((await acoesDoCard(B.id, c.id, w.actor)).map((a) => a.id)).toContain(id);
    expect(await erro(executarAcao(alvo(), id, c.id, {}))).toBe("preencha Novo valor");
    expect(await erro(executarAcao(alvo(), id, c.id, { novo_valor: "abc" }))).toMatch(/número inválido/);
    const r = await executarAcao(alvo(), id, c.id, { novo_valor: "1.500,5".replace(".", ""), nota: "ok" });
    expect(r).toMatchObject({ status: "success", env: "published" });
    const [x] = await db.select().from(cards).where(eq(cards.id, c.id));
    expect(x.props[B.f.valor]).toBe(1500.5);
    expect(x.phaseId).toBe(B.fases.Aprovado);
    const [com] = await db.select().from(cardComments).where(eq(cardComments.cardId, c.id));
    expect(com).toMatchObject({ body: "Valor registrado: 1500.5 ok", authorId: w.user.id });
    // Agora o valor é 1500: a ação some do card
    expect((await acoesDoCard(B.id, c.id, w.actor)).map((a) => a.id)).not.toContain(id);
    expect(await erro(executarAcao(alvo(), id, c.id, { novo_valor: 1 }))).toBe("ação indisponível neste card");
  });

  it("estrutura: boards com campos/fases e relações do board", async () => {
    const e = await estruturaParaAutomacoes(w.ws.id, B.id);
    expect(e.boards.map((b) => b.id)).toEqual(expect.arrayContaining([B.id, B.outro]));
    expect(e.boards.find((b) => b.id === B.id)?.fases.map((f) => f.name)).toEqual(["Novo", "Aprovado"]);
  });
});

describe("variáveis e SMTP", () => {
  it("secreta é cifrada no banco e não volta para a UI; senha do SMTP é mantida quando vazia", async () => {
    await salvarVariavel({ wsId: w.ws.id, actor: w.actor }, "TOKEN", "abc-123-segredo", true);
    await salvarVariavel({ wsId: w.ws.id, actor: w.actor }, "URL", "https://x.test", false);
    expect(await erro(salvarVariavel({ wsId: w.ws.id, actor: w.actor }, "com espaço", "x", false))).toMatch(/nome da variável/);
    const [bruto] = await db.select().from(variables).where(eq(variables.key, "TOKEN"));
    expect(bruto.value).not.toContain("abc-123-segredo");
    expect(await variaveisDoWorkspace(w.ws.id)).toEqual([
      { key: "TOKEN", value: "", secreta: true },
      { key: "URL", value: "https://x.test", secreta: false },
    ]);
    // Regravar secreta com valor vazio mantém o segredo
    await salvarVariavel({ wsId: w.ws.id, actor: w.actor }, "TOKEN", "", true);
    expect((await db.select().from(variables).where(eq(variables.key, "TOKEN")))[0].value).toBe(bruto.value);

    await salvarSmtp({ wsId: w.ws.id, actor: w.actor }, { host: "smtp.x.test", port: 587, secure: false, user: "u", from: "Plexu <p@x.test>", senha: "s3nha" });
    await salvarSmtp({ wsId: w.ws.id, actor: w.actor }, { host: "smtp2.x.test", port: 465, secure: true, user: "u", from: "p@x.test", senha: "" });
    expect(await smtpDoWorkspaceUI(w.ws.id)).toEqual({ host: "smtp2.x.test", port: 465, secure: true, user: "u", from: "p@x.test", temSenha: true });
  });
});
