// Campos do formulário de criação por fase (card ainda não existe).
// field_phase_settings vence; sem ajuste, visible_expr/required_expr avaliadas sobre um card vazio.
// Expressões que dependem de relações ou dados do card não avaliam aqui: ficam visível=sim, obrigatório=não.
import { compile } from "@/lib/expr";
import type { BoardCompleto, CampoUI } from "@/server/consultas";

export interface CampoCriacao {
  id: string;
  name: string;
  slug: string;
  type: string;
  config: Record<string, unknown>;
  helpText: string | null;
  obrigatorio: boolean;
}

export interface AjusteFase {
  fieldId: string;
  phaseId: string;
  visible: boolean | null;
  editable: boolean | null;
  required: boolean | null;
}

const EDITAVEIS_NA_CRIACAO = new Set([
  "text",
  "long_text",
  "number",
  "currency",
  "date",
  "datetime",
  "boolean",
  "select",
  "multi_select",
  "person",
  "cpf",
  "cnpj",
]);

function avaliar(fonte: string | null, fase: string | null, hoje: string, padrao: boolean): boolean {
  if (!fonte) return padrao;
  try {
    return compile(fonte).evaluateBool({ card: {}, fase, hoje });
  } catch {
    return padrao;
  }
}

export function camposDaFase(board: BoardCompleto, ajustes: AjusteFase[], faseId: string | null, hoje: string): CampoCriacao[] {
  const fase = faseId ? board.fases.find((f) => f.id === faseId)?.name ?? null : null;
  return board.campos
    .filter((c: CampoUI) => EDITAVEIS_NA_CRIACAO.has(c.type))
    .flatMap((c) => {
      const aj = faseId ? ajustes.find((a) => a.fieldId === c.id && a.phaseId === faseId) : undefined;
      const visivel = aj?.visible ?? avaliar(c.visibleExpr, fase, hoje, true);
      const editavel = aj?.editable !== false;
      if (!visivel || !editavel) return [];
      return [
        {
          id: c.id,
          name: c.name,
          slug: c.slug,
          type: c.type,
          config: c.config,
          helpText: c.helpText,
          obrigatorio: aj?.required ?? avaliar(c.requiredExpr, fase, hoje, false),
        },
      ];
    });
}
