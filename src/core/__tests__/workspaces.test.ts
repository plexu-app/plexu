// Arquivar, restaurar e excluir workspace. Excluir remove tudo em cascata (boards, fases, campos,
// regras, cards, ligações, comentários, anexos, automações, views, membros); os eventos ficam, marcados
// com workspace_deleted_at, e a linha do workspace vira lápide (FK dos eventos continua válida).
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import {
  attachments,
  automations,
  boards,
  cardLinks,
  cards,
  events,
  fieldPhaseSettings,
  users,
  views,
  workspaceMembers,
  workspaces,
} from "../../db/schema";
import { createCard, linkCards } from "../cards";
import { addComment } from "../comments";
import { CoreError, type Actor } from "../types";
import { arquivarWorkspace, excluirWorkspace, restaurarWorkspace } from "../workspaces";
import { criarBoard, criarCampo, criarRegra, criarWorkspace } from "./fixtures";

const erro = (p: Promise<unknown>) => p.then(() => null, (e) => e as CoreError);

/** Workspace com dois boards, relação, card ligado, comentário, anexo, regra, automação e view. */
async function montar() {
  const w = await criarWorkspace();
  const b1 = await criarBoard(w.ws.id, "contratos", [{ name: "Aberto" }, { name: "Fechado", terminal: true }]);
  const b2 = await criarBoard(w.ws.id, "fornecedores");
  await criarCampo(b2.id, { slug: "nome", type: "text" });
  const doc = await criarCampo(b1.id, { slug: "doc", type: "attachment" });
  await criarCampo(b1.id, { slug: "fornecedor", type: "relation", config: { relation: { target_board: b2.id, cardinality: "one" } } });
  await db.insert(fieldPhaseSettings).values({ fieldId: doc, phaseId: b1.fases.Aberto, visible: true });
  await criarRegra({ boardId: b1.id, kind: "can_edit", expr: "true", message: "x" });
  const f = await createCard({ boardId: b2.id, props: { nome: "Beta" }, actor: w.actor });
  const [a] = await db
    .insert(attachments)
    .values({ workspaceId: w.ws.id, fieldId: doc, storageKey: `k-${w.ws.id}`, filename: "d.pdf", mime: "application/pdf", size: 3 })
    .returning();
  const c = await createCard({ boardId: b1.id, props: { doc: [a.id] }, actor: w.actor });
  await linkCards({ fieldId: "fornecedor", fromCardId: c.id, toCardId: f.id, actor: w.actor });
  await addComment({ cardId: c.id, body: "olá", actor: w.actor });
  await db.insert(automations).values({ workspaceId: w.ws.id, boardId: b1.id, name: "a", trigger: { event: "card.created" } });
  await db.insert(views).values({ workspaceId: w.ws.id, boardId: b1.id, type: "kanban", name: "Kanban" });
  return { ...w, boards: [b1.id, b2.id], cards: [c.id, f.id] };
}

/** O trigger recusa: drizzle embrulha o erro do Postgres em cause. */
const recusado = (p: PromiseLike<unknown>) =>
  Promise.resolve(p).then(
    () => "aceito",
    (e: Error & { cause?: Error }) => (/append-only/.test(e.cause?.message ?? e.message) ? "recusado" : e.message),
  );

const contarEventos = async (wsId: string) => (await db.select().from(events).where(eq(events.workspaceId, wsId))).length;

let dono: Awaited<ReturnType<typeof montar>>;
let outro: Awaited<ReturnType<typeof montar>>;
let membro: Actor;

beforeAll(async () => {
  dono = await montar();
  outro = await montar();
  const [u] = await db.insert(users).values({ email: `m-${dono.ws.id}@teste.dev`, name: "Membro" }).returning();
  await db.insert(workspaceMembers).values({ workspaceId: dono.ws.id, userId: u.id, orgRole: "admin" });
  membro = { type: "user", id: u.id };
});

describe("arquivar e restaurar", () => {
  it("só o owner; dados intactos; eventos config.changed", async () => {
    expect((await erro(arquivarWorkspace({ workspaceId: dono.ws.id, actor: membro })))?.codigo).toBe("sem_permissao");
    await arquivarWorkspace({ workspaceId: dono.ws.id, actor: dono.actor });
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, dono.ws.id));
    expect(ws.archivedAt).not.toBeNull();
    expect(await db.select().from(cards).where(eq(cards.workspaceId, dono.ws.id))).toHaveLength(2);

    await restaurarWorkspace({ workspaceId: dono.ws.id, actor: dono.actor });
    expect((await db.select().from(workspaces).where(eq(workspaces.id, dono.ws.id)))[0].archivedAt).toBeNull();
    const acoes = (await db.select().from(events).where(eq(events.workspaceId, dono.ws.id)))
      .filter((e) => e.type === "config.changed")
      .map((e) => (e.data as { acao: string }).acao);
    expect(acoes).toEqual(["archived", "restored"]);
  });
});

describe("excluir", () => {
  it("exige owner e o nome exato", async () => {
    expect((await erro(excluirWorkspace({ workspaceId: dono.ws.id, actor: membro, confirmacao: dono.ws.name })))?.codigo).toBe("sem_permissao");
    expect((await erro(excluirWorkspace({ workspaceId: dono.ws.id, actor: dono.actor, confirmacao: "outro nome" })))?.codigo).toBe("validacao");
    expect(await db.select().from(boards).where(eq(boards.workspaceId, dono.ws.id))).toHaveLength(2);
  });

  it("cascata completa; eventos preservados e marcados; outro workspace intacto", async () => {
    const antes = await contarEventos(dono.ws.id);
    const outroAntes = await contarEventos(outro.ws.id);
    const r = await excluirWorkspace({ workspaceId: dono.ws.id, actor: dono.actor, confirmacao: dono.ws.name });
    expect(r.chavesAnexos).toEqual([`k-${dono.ws.id}`]);
    expect(r.removidos).toEqual({ boards: 2, cards: 2, ligacoes: 1, comentarios: 1, anexos: 1, automacoes: 1, views: 1 });

    const sobra = async (t: string, col: string, ids: string[]) =>
      Number((await db.execute(sql.raw(`select count(*)::int n from ${t} where ${col} in (${ids.map((i) => `'${i}'`).join(",")})`)))[0].n);
    expect(await sobra("boards", "id", dono.boards)).toBe(0);
    expect(await sobra("phases", "board_id", dono.boards)).toBe(0);
    expect(await sobra("fields", "board_id", dono.boards)).toBe(0);
    expect(await sobra("rules", "board_id", dono.boards)).toBe(0);
    expect(await sobra("cards", "id", dono.cards)).toBe(0);
    expect(await sobra("card_links", "from_card_id", dono.cards)).toBe(0);
    expect(await sobra("card_comments", "card_id", dono.cards)).toBe(0);
    expect(await sobra("attachments", "workspace_id", [dono.ws.id])).toBe(0);
    expect(await sobra("automations", "workspace_id", [dono.ws.id])).toBe(0);
    expect(await sobra("views", "workspace_id", [dono.ws.id])).toBe(0);
    expect(await sobra("workspace_members", "workspace_id", [dono.ws.id])).toBe(0);

    // Lápide: slug liberado, nome mantido, deleted_at
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, dono.ws.id));
    expect(ws.deletedAt).not.toBeNull();
    expect(ws.name).toBe(dono.ws.name);
    expect(ws.slug).not.toBe(dono.ws.slug);

    // Eventos: todos ficam (+1 de exclusão), todos marcados
    const evs = await db.select().from(events).where(eq(events.workspaceId, dono.ws.id));
    expect(evs).toHaveLength(antes + 1);
    expect(evs.every((e) => e.workspaceDeletedAt?.getTime() === ws.deletedAt!.getTime())).toBe(true);
    expect(evs.some((e) => e.type === "card.created" && e.cardId === dono.cards[0])).toBe(true);
    expect(evs.find((e) => (e.data as { acao?: string }).acao === "deleted")?.data).toMatchObject({ entidade: "workspace", dados: { name: dono.ws.name } });

    // Outro workspace intacto
    expect(await contarEventos(outro.ws.id)).toBe(outroAntes);
    expect(await sobra("cards", "id", outro.cards)).toBe(2);
    expect(await db.select().from(cardLinks).where(eq(cardLinks.fromCardId, outro.cards[0]))).toHaveLength(1);
    expect((await db.select().from(events).where(eq(events.workspaceId, outro.ws.id))).every((e) => e.workspaceDeletedAt === null)).toBe(true);
  });

  it("events continua append-only: só a marca é aceita, e só com o workspace excluído", async () => {
    const [e] = await db.select().from(events).where(eq(events.workspaceId, dono.ws.id)).limit(1);
    expect(await recusado(db.update(events).set({ data: {} }).where(eq(events.id, e.id)))).toBe("recusado");
    expect(await recusado(db.delete(events).where(eq(events.id, e.id)))).toBe("recusado");
    expect(await recusado(db.update(events).set({ workspaceDeletedAt: null }).where(eq(events.id, e.id)))).toBe("recusado");
    // Workspace vivo: marcar não é permitido
    const [v] = await db.select().from(events).where(eq(events.workspaceId, outro.ws.id)).limit(1);
    expect(await recusado(db.update(events).set({ workspaceDeletedAt: new Date() }).where(eq(events.id, v.id)))).toBe("recusado");
  });

  it("excluído não pode ser arquivado, restaurado nem excluído de novo", async () => {
    expect((await erro(restaurarWorkspace({ workspaceId: dono.ws.id, actor: dono.actor })))?.codigo).toBe("nao_encontrado");
    expect((await erro(excluirWorkspace({ workspaceId: dono.ws.id, actor: dono.actor, confirmacao: dono.ws.name })))?.codigo).toBe("nao_encontrado");
  });
});
