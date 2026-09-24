// Validação do APP_SECRET (pura; usada no boot e ao assinar sessões).

export const SEGREDO_EXEMPLO = "troque-por-um-segredo-aleatorio-de-32-caracteres";
export const SEGREDO_MINIMO = 32;
export const COMO_GERAR = "gere com: openssl rand -hex 32 e defina APP_SECRET no .env";

/** Problema com o segredo, ou null se ele serve para produção. */
export function problemaNoSegredo(s: string | undefined): string | null {
  if (!s || !s.trim()) return "APP_SECRET não definido";
  if (s === SEGREDO_EXEMPLO || s === "change-me") return "APP_SECRET ainda está com o valor de exemplo";
  if (s.length < SEGREDO_MINIMO) return `APP_SECRET curto (${s.length} caracteres; mínimo ${SEGREDO_MINIMO})`;
  return null;
}
