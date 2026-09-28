// Ciclo de vida do workspace: arquivar (some das listas, dados intactos), restaurar e excluir.
// Excluir remove boards, cards, ligações, comentários, anexos, automações e views; a linha do
// workspace fica como lápide (deleted_at) para que os eventos, append-only, continuem com FK válida.
// Os eventos são marcados com workspace_deleted_at (única mudança que o trigger aceita em events).
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  attachments,
  automations,
  boards,
  cardComments,
  cardLinks,
  cards,
  events,
  views,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { emitirEventoConfig } from "./events";
import { CoreError, validarAtor, type Actor, type Tx } from "./types";

type Workspace = typeof workspaces.$inferSelect;

/** Trava o workspace (não excluído) e confere que o ator é owner. */
async function exigirOwner(tx: Tx, workspaceId: string, actor: Actor): Promise<Workspace> {
  validarAtor(actor);
  const [ws] = await tx.select().from(workspaces).where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt))).for("update");
  if (!ws) throw new CoreError("nao_encontrado", "workspace não encontrado");
  const [m] = actor.type === "user"
    ? await tx.select({ papel: workspaceMembers.orgRole }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.userId, actor.id)))
    : [];
  if (m?.papel !== "owner") throw new CoreError("sem_permissao", "Apenas o owner pode arquivar, restaurar ou excluir o workspace.");
  return ws;
}

export interface WorkspaceInput {
  workspaceId: string;
  actor: Actor;
}

/** Arquiva: some da sidebar e das listas; nada é apagado. */
export async function arquivarWorkspace(input: WorkspaceInput): Promise<void> {
  await db.transaction(async (tx) => {
    const ws = await exigirOwner(tx, input.workspaceId, input.actor);
    if (ws.archivedAt) return;
    await tx.update(workspaces).set({ archivedAt: new Date() }).where(eq(workspaces.id, ws.id));
    await emitirEventoConfig(tx, { workspaceId: ws.id, boardId: null, actor: input.actor }, { entidade: "workspace", acao: "archived", id: ws.id, dados: { name: ws.name } });
  });
}

/** Restaura um workspace arquivado. */
export async function restaurarWorkspace(input: WorkspaceInput): Promise<void> {
  await db.transaction(async (tx) => {
    const ws = await exigirOwner(tx, input.workspaceId, input.actor);
    if (!ws.archivedAt) return;
    await tx.update(workspaces).set({ archivedAt: null }).where(eq(workspaces.id, ws.id));
    await emitirEventoConfig(tx, { workspaceId: ws.id, boardId: null, actor: input.actor }, { entidade: "workspace", acao: "restored", id: ws.id, dados: { name: ws.name } });
  });
}

export interface ExcluirWorkspaceInput extends WorkspaceInput {
  /** Nome digitado pelo usuário: precisa ser igual ao nome do workspace. */
  confirmacao: string;
}

export interface ResultadoExclusao {
  /** Chaves dos arquivos de anexo no armazenamento: o chamador apaga depois do commit. */
  chavesAnexos: string[];
  removidos: { boards: number; cards: number; ligacoes: number; comentarios: number; anexos: number; automacoes: number; views: number };
}

/**
 * Exclui o workspace (só owner, confirmando o nome). Tudo numa transação; os arquivos dos anexos
 * não entram nela: saem em chavesAnexos para o chamador remover do disco após o commit.
 */
export async function excluirWorkspace(input: ExcluirWorkspaceInput): Promise<ResultadoExclusao> {
  return db.transaction(async (tx) => {
    const ws = await exigirOwner(tx, input.workspaceId, input.actor);
    if (input.confirmacao.trim() !== ws.name.trim()) throw new CoreError("validacao", "Digite o nome do workspace exatamente como aparece para confirmar.");

    const idsCards = tx.select({ id: cards.id }).from(cards).where(eq(cards.workspaceId, ws.id));
    const contar = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
    const removidos = {
      boards: await contar(tx.select({ n: count() }).from(boards).where(eq(boards.workspaceId, ws.id))),
      cards: await contar(tx.select({ n: count() }).from(cards).where(eq(cards.workspaceId, ws.id))),
      ligacoes: await contar(tx.select({ n: count() }).from(cardLinks).where(inArray(cardLinks.fromCardId, idsCards))),
      comentarios: await contar(tx.select({ n: count() }).from(cardComments).where(inArray(cardComments.cardId, idsCards))),
      anexos: await contar(tx.select({ n: count() }).from(attachments).where(eq(attachments.workspaceId, ws.id))),
      automacoes: await contar(tx.select({ n: count() }).from(automations).where(eq(automations.workspaceId, ws.id))),
      views: await contar(tx.select({ n: count() }).from(views).where(eq(views.workspaceId, ws.id))),
    };
    const chavesAnexos = (await tx.select({ chave: attachments.storageKey }).from(attachments).where(eq(attachments.workspaceId, ws.id))).map((a) => a.chave);

    // Ordem: o que referencia sem cascata primeiro (anexos → comentários/campos; cards → fases).
    await tx.delete(attachments).where(eq(attachments.workspaceId, ws.id));
    await tx.delete(automations).where(eq(automations.workspaceId, ws.id)); // automation_runs em cascata
    await tx.delete(views).where(eq(views.workspaceId, ws.id));
    await tx.delete(cardLinks).where(inArray(cardLinks.fromCardId, idsCards));
    await tx.delete(cardComments).where(inArray(cardComments.cardId, idsCards));
    await tx.delete(cards).where(eq(cards.workspaceId, ws.id));
    await tx.delete(boards).where(eq(boards.workspaceId, ws.id)); // fases, campos, regras, ações, sequências em cascata
    await tx.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, ws.id));

    // Lápide: libera o slug para reúso e zera configurações; o nome fica para a auditoria.
    const agora = new Date();
    await tx
      .update(workspaces)
      .set({ deletedAt: agora, archivedAt: ws.archivedAt ?? agora, settings: {}, slug: `${ws.slug}~excluido-${ws.id.slice(0, 8)}` })
      .where(eq(workspaces.id, ws.id));
    await emitirEventoConfig(tx, { workspaceId: ws.id, boardId: null, actor: input.actor }, {
      entidade: "workspace",
      acao: "deleted",
      id: ws.id,
      dados: { name: ws.name, slug: ws.slug, removidos },
    });
    await tx.update(events).set({ workspaceDeletedAt: agora }).where(and(eq(events.workspaceId, ws.id), isNull(events.workspaceDeletedAt)));
    return { chavesAnexos, removidos };
  });
}
