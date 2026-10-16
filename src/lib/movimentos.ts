// Destinos do "Mover card para fase" (prompt PR 2, B2). Puro.

export interface Movimento {
  faseId: string;
  permitido: boolean;
  motivo?: string;
  /** Bloqueado por campo obrigatório vazio (não por regra). */
  obrigatorios?: boolean;
  /** Destino antes da fase atual. */
  volta: boolean;
  /** A fase imediatamente anterior. */
  anterior: boolean;
}

/**
 * À frente: os permitidos e os travados só por obrigatório vazio (desabilitados, com o motivo); os
 * recusados por regra não aparecem. Para trás: só a fase imediatamente anterior, se permitida.
 * motivo: o texto aparece só na primeira pill que o tem (sem repetir).
 */
export function destinosVisiveis<M extends Movimento>(movs: M[]): { frente: (M & { motivoVisivel: string | null })[]; anterior: M | null } {
  const vistos = new Set<string>();
  const frente = movs
    .filter((m) => !m.volta && (m.permitido || m.obrigatorios))
    .map((m) => {
      const motivo = !m.permitido && m.motivo && !vistos.has(m.motivo) ? m.motivo : null;
      if (motivo) vistos.add(motivo);
      return { ...m, motivoVisivel: motivo };
    });
  return { frente, anterior: movs.find((m) => m.volta && m.anterior && m.permitido) ?? null };
}
