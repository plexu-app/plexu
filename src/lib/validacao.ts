// Validação de formato de campos de texto (fields.validation = { regex, message, description }).
// Pura: roda no core (palavra final), no modal de criação e no formulário da fase, para que o erro
// apareça abaixo do campo com a mensagem configurada — nunca só a validação nativa do navegador.

export interface ValidacaoCampo {
  /** Expressão regular (sintaxe JavaScript) que o texto inteiro deve satisfazer. */
  regex?: string;
  /** Mensagem mostrada quando o texto não bate com o regex. */
  message?: string;
  /** Descrição curta do formato esperado (usada quando não há message). */
  description?: string;
  min?: number | string;
  max?: number | string;
}

const TIPOS_TEXTO = new Set(["text", "long_text"]);

/** Mensagem de formato: a configurada no campo ou "Formato inválido. Esperado: <descrição>". */
export function mensagemFormato(v: ValidacaoCampo | null | undefined): string {
  if (v?.message?.trim()) return v.message.trim();
  const esperado = v?.description?.trim() || (v?.regex ? `texto que corresponda a ${v.regex}` : "outro formato");
  return `Formato inválido. Esperado: ${esperado}`;
}

/** Erro de formato do valor digitado, ou null. Vazio não é erro de formato (obrigatoriedade é outra regra). */
export function validarFormato(campo: { type: string; validation?: ValidacaoCampo | Record<string, unknown> | null }, valor: string): string | null {
  const v = (campo.validation ?? null) as ValidacaoCampo | null;
  if (!TIPOS_TEXTO.has(campo.type) || !v?.regex || valor === "") return null;
  let re: RegExp;
  try {
    re = new RegExp(v.regex);
  } catch {
    return null; // regex inválido é erro de configuração; o servidor recusa ao salvar o campo
  }
  return re.test(valor) ? null : mensagemFormato(v);
}

/** Valida e normaliza a configuração de validação de um campo. Lança Error com mensagem clara. */
export function normalizarValidacao(bruto: unknown): ValidacaoCampo | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const texto = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const saida: ValidacaoCampo = {};
  const regex = texto(b.regex);
  if (regex) {
    try {
      new RegExp(regex);
    } catch (e) {
      throw new Error(`formato (regex) inválido: ${(e as Error).message}`);
    }
    saida.regex = regex;
  }
  if (texto(b.message)) saida.message = texto(b.message);
  if (texto(b.description)) saida.description = texto(b.description);
  for (const k of ["min", "max"] as const) if (typeof b[k] === "number" || (typeof b[k] === "string" && b[k] !== "")) saida[k] = b[k] as number | string;
  return Object.keys(saida).length ? saida : null;
}
