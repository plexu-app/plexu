// "Valor inicial" do campo na UI simples: nenhum, data de hoje ou um valor fixo, convertidos de/para
// a expressão CEL guardada em default_value_expr. O resto fica no editor CEL (Avançado).

export type ModoInicial = "nenhum" | "hoje" | "fixo" | "avancado";
export const TIPOS_DATA = new Set(["date", "datetime"]);
export const TIPOS_NUMERO = new Set(["number", "currency"]);

/** Lê uma expressão de valor inicial como algo que a UI simples representa. */
export function lerValorInicial(tipo: string, expr: string): { modo: ModoInicial; fixo: string } {
  const s = expr.trim();
  if (!s) return { modo: "nenhum", fixo: "" };
  if (s === "hoje()" && TIPOS_DATA.has(tipo)) return { modo: "hoje", fixo: "" };
  if (tipo === "boolean" && (s === "true" || s === "false")) return { modo: "fixo", fixo: s };
  if (TIPOS_NUMERO.has(tipo) && /^-?\d+(\.\d+)?$/.test(s)) return { modo: "fixo", fixo: s };
  if (!TIPOS_NUMERO.has(tipo) && tipo !== "boolean" && /^"(?:[^"\\]|\\.)*"$/.test(s)) {
    try {
      return { modo: "fixo", fixo: JSON.parse(s) as string };
    } catch {
      // cai no avançado
    }
  }
  return { modo: "avancado", fixo: "" };
}

export function exprDoValorFixo(tipo: string, v: string): string {
  if (tipo === "boolean") return v === "true" ? "true" : "false";
  if (TIPOS_NUMERO.has(tipo)) {
    const limpo = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
    const n = Number(limpo);
    return v.trim() && Number.isFinite(n) ? String(n) : "";
  }
  return v.trim() ? JSON.stringify(v) : "";
}

