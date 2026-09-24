import "server-only";
// Composição de operações do core que precisam ser atômicas juntas (mesma transação).
import { db } from "@/db";
import { createCard, linkCards, type Actor, type CardRow } from "@/core";

/**
 * Cria um card "filho" no board do outro lado da relação e liga ao pai, numa transação.
 * - lado "origem": o campo é do board do pai (pai → filho via linkCards).
 * - lado "destino": o campo é do board do filho (filho → pai; relação vai em props).
 */
export async function criarFilho(input: {
  actor: Actor;
  paiId: string;
  campo: { id: string; slug: string };
  lado: "origem" | "destino";
  boardFilhoId: string;
  props: Record<string, unknown>;
}): Promise<CardRow> {
  return db.transaction(async (tx) => {
    if (input.lado === "destino") {
      return createCard(
        { boardId: input.boardFilhoId, props: { ...input.props, [input.campo.id]: [input.paiId] }, actor: input.actor },
        { tx },
      );
    }
    const filho = await createCard({ boardId: input.boardFilhoId, props: input.props, actor: input.actor }, { tx });
    await linkCards({ fieldId: input.campo.id, fromCardId: input.paiId, toCardId: filho.id, actor: input.actor }, { tx });
    return filho;
  });
}
