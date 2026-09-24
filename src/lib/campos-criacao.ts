// Visibilidade e obrigatoriedade dos campos no formulário de criação, avaliadas sobre os valores
// digitados. Pura: roda no navegador (ao vivo) e no servidor (revalidação antes do core).
// field_phase_settings da fase vence; sem ajuste, visible_expr / required_expr com o motor CEL.
import { compile, type Registro } from "./expr";
import { valorDoForm } from "./form-campos";

export interface AjusteCriacao {
  visible: boolean | null;
  editable: boolean | null;
  required: boolean | null;
}

export interface CampoCriacaoDef {
  id: string;
  name: string;
  slug: string;
  type: string;
  config: Record<string, unknown>;
  helpText: string | null;
  visibleExpr: string | null;
  requiredExpr: string | null;
  ajuste: AjusteCriacao | null;
}

export interface EstadoCriacao {
  visivel: boolean;
  obrigatorio: boolean;
}

const NUMERICOS = new Set(["number", "currency"]);

/** Valores do formulário (strings do HTML) → registro por slug, como o card verá nas expressões. */
export function registroDoForm(campos: CampoCriacaoDef[], valores: Record<string, string[]>): Registro {
  const r: Registro = {};
  for (const c of campos) {
    const brutos = valores[c.id];
    if (brutos === undefined && c.type !== "boolean") continue;
    let v = valorDoForm(c.type, brutos ?? []);
    if (NUMERICOS.has(c.type) && typeof v === "string") {
      const n = Number(v);
      v = Number.isFinite(n) ? n : v;
    }
    if (v === null || (Array.isArray(v) && v.length === 0)) continue;
    r[c.slug] = v;
  }
  return r;
}

function avaliar(fonte: string | null, ctx: { card: Registro; fase: string | null; hoje: string }, padrao: boolean): boolean {
  if (!fonte) return padrao;
  try {
    return compile(fonte).evaluateBool(ctx);
  } catch {
    return padrao; // relações, erros ou tipos inesperados: o core decide ao salvar
  }
}

export function estadoCriacao(campos: CampoCriacaoDef[], card: Registro, fase: string | null, hoje: string): Record<string, EstadoCriacao> {
  const ctx = { card, fase, hoje };
  const saida: Record<string, EstadoCriacao> = {};
  for (const c of campos) {
    const visivel = c.ajuste?.visible ?? avaliar(c.visibleExpr, ctx, true);
    saida[c.id] = { visivel, obrigatorio: visivel && (c.ajuste?.required ?? avaliar(c.requiredExpr, ctx, false)) };
  }
  return saida;
}

/** FormData → valores por field_id (todas as entradas f:<id>). */
export function valoresDoFormData(form: FormData): Record<string, string[]> {
  const v: Record<string, string[]> = {};
  for (const [k, x] of form.entries()) {
    if (!k.startsWith("f:") || typeof x !== "string") continue;
    (v[k.slice(2)] ??= []).push(x);
  }
  return v;
}

/**
 * Campos faltantes (ids) × campos do formulário: o primeiro faltante que está no formulário (para
 * rolar até ele e destacá-lo) e as mensagens dos que o formulário não mostra — obrigatório que o
 * usuário não consegue preencher é erro de configuração.
 */
export function diagnosticarFaltantes(
  faltantes: string[],
  noFormulario: string[],
  nomes: Record<string, string>,
): { primeiro: string | null; mensagensForaDoFormulario: string[] } {
  const falta = new Set(faltantes);
  const visiveis = new Set(noFormulario);
  return {
    primeiro: noFormulario.find((id) => falta.has(id)) ?? null,
    mensagensForaDoFormulario: faltantes
      .filter((id) => !visiveis.has(id))
      .map((id) => `Campo ${nomes[id] ?? id} é obrigatório mas não está visível — corrija a configuração.`),
  };
}
