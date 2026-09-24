// Conversão de valores de formulário (strings) para os valores esperados pelo core, por tipo.
// A validação de verdade é do core; aqui só se interpreta o que o HTML entrega.

/** Nome do input de um campo no formulário do card. */
export const nomeInput = (fieldId: string) => `f:${fieldId}`;

/**
 * valores: todos os valores enviados para o input (getAll). marcado: para boolean,
 * se o checkbox veio. Retorna null para vazio (limpar), undefined para "não alterar".
 */
export function valorDoForm(tipo: string, valores: string[]): unknown {
  const v = valores[0]?.trim() ?? "";
  switch (tipo) {
    case "boolean":
      return valores.includes("on") || valores.includes("true");
    case "multi_select":
      return valores.filter((x) => x !== "");
    case "person":
      return v === "" ? null : v;
    case "number":
    case "currency": {
      if (v === "") return null;
      // aceita "1.234,56" (pt-BR) e "1234.56"
      const n = /,\d{1,}$/.test(v) || (v.includes(",") && !v.includes(".")) ? v.replace(/\./g, "").replace(",", ".") : v;
      return n;
    }
    default:
      return v === "" ? null : v;
  }
}

/** FormData → props do core, só para os campos listados (id → tipo). */
export function propsDoForm(form: FormData, campos: { id: string; type: string }[]): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const c of campos) {
    const nome = nomeInput(c.id);
    const valores = form.getAll(nome).map(String);
    if (c.type !== "boolean" && c.type !== "multi_select" && !form.has(nome)) continue;
    props[c.id] = valorDoForm(c.type, valores);
  }
  return props;
}
