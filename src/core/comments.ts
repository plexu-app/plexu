// Comentários de card. Escrita com evento comment.added na mesma transação.
import { cardComments } from "../db/schema";
import { executar } from "./cards";
import { emitirEvento } from "./events";
import { lerCard } from "./meta";
import { CoreError, type Actor, type OpcoesOp } from "./types";

export interface AddCommentInput {
  cardId: string;
  body: string;
  parentId?: string | null;
  actor: Actor;
}

export const LIMITE_COMENTARIO = 10_000;

export function addComment(input: AddCommentInput, opts?: OpcoesOp) {
  return executar(input.actor, opts, async (op) => {
    const body = (input.body ?? "").trim();
    if (!body) throw new CoreError("validacao", "comentário vazio");
    if (body.length > LIMITE_COMENTARIO) throw new CoreError("validacao", `comentário acima de ${LIMITE_COMENTARIO} caracteres`);
    const card = await lerCard(op, input.cardId);
    const [c] = await op.tx
      .insert(cardComments)
      .values({
        cardId: card.id,
        parentId: input.parentId ?? null,
        authorId: op.actor.type === "user" ? op.actor.id : null,
        body,
        source: op.actor.type === "automation" ? "automation" : op.actor.type === "user" ? "user" : "system",
      })
      .returning();
    await emitirEvento(
      op.tx,
      { workspaceId: card.workspaceId, boardId: card.boardId, cardId: card.id, actor: op.actor },
      { type: "comment.added", data: { comment_id: c.id } },
    );
    return c;
  });
}
