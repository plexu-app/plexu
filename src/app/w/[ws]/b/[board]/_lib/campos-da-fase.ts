// Campos do formulário de criação de uma fase (card ainda não existe): definições com expressões e
// ajuste da fase. Visibilidade e obrigatoriedade são avaliadas sobre os valores digitados
// (src/lib/campos-criacao.ts), no navegador e de novo no servidor; o core é a palavra final.
import type { CampoCriacaoDef } from "@/lib/campos-criacao";
import { ajusteEfetivo } from "@/lib/fases-preenchimento";
import { TIPOS_CALCULADOS_UI } from "@/lib/formatar";
import type { BoardCompleto } from "@/server/consultas";

export interface AjusteFase {
  fieldId: string;
  phaseId: string;
  visible: boolean | null;
  editable: boolean | null;
  required: boolean | null;
}

/** Ajuste efetivo: field_phase_settings por cima do padrão das fases de preenchimento (src/lib/fases-preenchimento.ts). */
function ajusteDe(board: Pick<BoardCompleto, "fases">, ajustes: AjusteFase[], c: { id: string; config: Record<string, unknown> }, faseId: string | null) {
  if (!faseId) return undefined;
  return ajusteEfetivo(c.config, board.fases, faseId, ajustes.find((a) => a.fieldId === c.id && a.phaseId === faseId));
}

/**
 * Campos que o formulário de criação mostra: todos os que o formulário da fase renderiza (tipos não
 * calculados) e relações N:1 (um card, ou "o card escolhido é o pai") como seletor com busca.
 * Relações 1:N (sub-tabela) ficam para depois de criar o card.
 */
export function editavelNaCriacao(c: { type: string; config: Record<string, unknown> }): boolean {
  if (TIPOS_CALCULADOS_UI.has(c.type)) return false;
  if (c.type !== "relation") return true;
  const r = (c.config.relation ?? {}) as { cardinality?: string; is_parent?: boolean };
  return r.cardinality === "one" || r.is_parent === true;
}

export function camposDaFase(board: Pick<BoardCompleto, "campos" | "fases">, ajustes: AjusteFase[], faseId: string | null): CampoCriacaoDef[] {
  return board.campos
    .filter(editavelNaCriacao)
    .flatMap((c) => {
      const aj = ajusteDe(board, ajustes, c, faseId);
      if (aj?.editable === false) return [];
      return [
        {
          id: c.id,
          name: c.name,
          slug: c.slug,
          type: c.type,
          config: c.config,
          helpText: c.helpText,
          visibleExpr: c.visibleExpr,
          requiredExpr: c.requiredExpr,
          ajuste: aj ? { visible: aj.visible, editable: aj.editable, required: aj.required } : null,
        },
      ];
    });
}

export const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/**
 * Campos que podem ser obrigatórios ao criar na fase (ajuste required=true, ou sem ajuste e com
 * required_expr), inclusive relações. Condicionais contam: o formulário rápido não avalia expressões.
 */
export function obrigatoriosPossiveis(board: Pick<BoardCompleto, "campos" | "fases">, ajustes: AjusteFase[], faseId: string | null): string[] {
  return board.campos
    .filter((c) => !TIPOS_CALCULADOS_UI.has(c.type))
    .filter((c) => {
      const aj = ajusteDe(board, ajustes, c, faseId);
      if (aj?.visible === false) return false;
      const expr = c.requiredExpr?.trim();
      return aj?.required ?? (!!expr && expr !== "false");
    })
    .map((c) => c.id);
}
