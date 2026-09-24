// Banco dos testes do vitest: plexu_test (nunca o do demo nem o do e2e).
// TEST_DATABASE_URL sobrescreve; senão, usa o servidor de DATABASE_URL (ou o padrão) com o banco plexu_test.
import { comBanco } from "../db/migrar";

export const BANCO_TESTE = "plexu_test";

export function urlDeTeste(env: Record<string, string | undefined> = process.env): string {
  if (env.TEST_DATABASE_URL) return env.TEST_DATABASE_URL;
  return comBanco(env.DATABASE_URL ?? "postgres://plexu:plexu@localhost:5433/plexu", BANCO_TESTE);
}
