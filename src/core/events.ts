// Emissão tipada de eventos. Sempre chamada dentro da transação da operação (invariante 2).
import { events } from "../db/schema";
import { validarAtor, type Actor, type Tx } from "./types";

export interface DadosLink {
  field_id: string;
  link_id: string;
  from_card_id: string;
  to_card_id: string;
  /** Lado do card do evento: origem (from) ou destino (to). */
  lado: "origem" | "destino";
  motivo?: "card_deleted";
}

export type EventoCard =
  | { type: "card.created"; data: { phase_id: string | null; props: Record<string, unknown> } }
  | { type: "card.moved"; data: { from_phase: string | null; to_phase: string | null } }
  | {
      type: "card.field_updated";
      /** computed=true quando o valor é calculado (rollup, dynamic_text). */
      data: { field_id: string; old: unknown; new: unknown; computed?: boolean };
    }
  | { type: "card.link_added"; data: DadosLink }
  | { type: "card.link_removed"; data: DadosLink }
  | { type: "card.deleted"; data: { phase_id: string | null } };

export type TipoEvento = EventoCard["type"];

export interface OrigemEvento {
  workspaceId: string;
  boardId: string;
  cardId: string;
  actor: Actor;
}

/** Grava um evento imutável na transação corrente e devolve o id. */
export async function emitirEvento(tx: Tx, origem: OrigemEvento, evento: EventoCard): Promise<string> {
  validarAtor(origem.actor);
  const [row] = await tx
    .insert(events)
    .values({
      workspaceId: origem.workspaceId,
      boardId: origem.boardId,
      cardId: origem.cardId,
      type: evento.type,
      actorType: origem.actor.type,
      actorId: origem.actor.id,
      data: semUndefined(evento.data),
    })
    .returning({ id: events.id });
  return row.id;
}

// jsonb não guarda undefined: old/new viram null explícito; demais chaves undefined somem.
function semUndefined<T extends object>(data: T): T {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) saida[k] = v;
    else if (k === "old" || k === "new") saida[k] = null;
  }
  return saida as T;
}
