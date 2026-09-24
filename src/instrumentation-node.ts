// Checagens de boot no runtime Node: em produção, falha cedo com mensagem clara.
import { COMO_GERAR, problemaNoSegredo } from "./server/auth/segredo";

export function verificarAmbiente(): void {
  if (process.env.NODE_ENV !== "production") return;
  const problema = problemaNoSegredo(process.env.APP_SECRET);
  if (problema) {
    console.error(`[plexu] ${problema}. O servidor não pode iniciar: ${COMO_GERAR}.`);
    process.exit(1);
  }
}
