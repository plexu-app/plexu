// Campos do formulário de criação de uma fase (card ainda não existe): definições com expressões e
// ajuste da fase. Visibilidade e obrigatoriedade são avaliadas sobre os valores digitados
// (src/lib/campos-criacao.ts), no navegador e de novo no servidor; o core é a palavra final.
import type { CampoCriacaoDef } from "@/lib/campos-criacao";
import type { BoardCompleto } from "@/server/consultas";

export interface AjusteFase {
  fieldId: string;
  phaseId: string;
  visible: boolean | null;
  editable: boolean | null;
  required: boolean | null;
}

export const EDITAVEIS_NA_CRIACAO = new Set([
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

export function camposDaFase(board: Pick<BoardCompleto, "campos">, ajustes: AjusteFase[], faseId: string | null): CampoCriacaoDef[] {
  return board.campos
    .filter((c) => EDITAVEIS_NA_CRIACAO.has(c.type))
    .flatMap((c) => {
      const aj = faseId ? ajustes.find((a) => a.fieldId === c.id && a.phaseId === faseId) : undefined;
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
