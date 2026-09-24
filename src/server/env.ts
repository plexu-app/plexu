import "server-only";
import { COMO_GERAR, problemaNoSegredo } from "./auth/segredo";

let avisado = false;

/**
 * APP_SECRET para assinar sessões. Em produção o boot já recusa segredo ausente/fraco
 * (src/instrumentation.ts); aqui a checagem se repete por segurança. Em dev, usa um
 * segredo local e avisa uma vez.
 */
export function segredoApp(): string {
  const s = process.env.APP_SECRET;
  const problema = problemaNoSegredo(s);
  if (!problema) return s!;
  if (process.env.NODE_ENV === "production") throw new Error(`${problema}: ${COMO_GERAR}`);
  if (!avisado) {
    console.warn(`[plexu] ${problema}; usando segredo de desenvolvimento (${COMO_GERAR})`);
    avisado = true;
  }
  return `dev-inseguro-${s ?? ""}-plexu-0000000000000000000000000`;
}
