// Avaliação de expressões no contexto de um card, sem escrita: condições de automação/ação,
// valores de set_field, mapeamentos de create_related_card e modelos {{ }}. Mesmo contexto das regras.
import type { Registro } from "../lib/expr";
import { executar } from "./cards";
import { carregarQuadro, lerCard, vistaDe, type VistaCard } from "./meta";
import { compilar, montarContexto } from "./rules";
import type { Actor, OpcoesOp } from "./types";

export interface AvaliarInput {
  /** Card do contexto; null = sem card (automação agendada por recorrência): card vazio do board. */
  cardId: string | null;
  boardId: string;
  exprs: string[];
  actor: Actor;
  /** Fases (ids) da transição que disparou, se houver. */
  faseOrigem?: string | null;
  faseDestino?: string | null;
  /** Valores do mini-form de uma ação. */
  form?: Registro | null;
}

/** Avalia cada expressão (CEL) e devolve os valores na mesma ordem. Erro de expressão propaga (ExprError). */
export function avaliarNoCard(input: AvaliarInput, opts?: OpcoesOp): Promise<unknown[]> {
  return executar(input.actor, opts, async (op) => {
    if (!input.exprs.length) return [];
    const card = input.cardId ? await lerCard(op, input.cardId) : null;
    const vista: VistaCard = card ? vistaDe(card) : { id: null, phaseId: null, title: "", status: "open", props: {}, computed: {} };
    const quadro = await carregarQuadro(op, card?.boardId ?? input.boardId);
    const compiladas = input.exprs.map(compilar);
    const ctx = await montarContexto(op, { quadro, card: vista, ligacoes: input.cardId ? undefined : [], faseOrigem: input.faseOrigem, faseDestino: input.faseDestino }, compiladas);
    return compiladas.map((e) => e.evaluate({ ...ctx, form: input.form ?? null }));
  });
}
