// Helpers puros da UI de board (testáveis sem React).

export interface CardKanban {
  id: string;
  title: string;
  phaseId: string | null;
}

/** Move o card para outra fase na lista local (atualização otimista). */
export function moverLocal(cards: CardKanban[], id: string, phaseId: string | null): CardKanban[] {
  return cards.map((c) => (c.id === id ? { ...c, phaseId } : c));
}

/** Colunas da sub-tabela de filhos: até 6 campos não-relação do board filho, exceto o de título. */
export function colunasSubTabela<T extends { id: string; type: string }>(campos: T[], titleFieldId: string | null, max = 6): T[] {
  return campos.filter((c) => c.type !== "relation" && c.id !== titleFieldId).slice(0, max);
}
