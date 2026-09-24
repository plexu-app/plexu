import "server-only";

let avisado = false;

/** APP_SECRET para assinar sessões. Obrigatório (≥ 16 caracteres) em produção. */
export function segredoApp(): string {
  const s = process.env.APP_SECRET;
  const placeholder = s === "troque-por-um-segredo-aleatorio-de-32-caracteres";
  if (s && s.length >= 16 && !(placeholder && process.env.NODE_ENV === "production")) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_SECRET ausente, curto ou com o valor de exemplo: defina um valor aleatório com 16+ caracteres");
  }
  if (!avisado) {
    console.warn("[plexu] APP_SECRET ausente/curto: usando segredo de desenvolvimento");
    avisado = true;
  }
  return `dev-inseguro-${s ?? ""}-plexu-000000`;
}
