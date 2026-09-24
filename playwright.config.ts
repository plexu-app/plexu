import { defineConfig, devices } from "@playwright/test";

// E2E contra o app real (next dev) e o banco plexu_e2e (E2E_DATABASE_URL sobrescreve), com `pnpm db:migrate` e `pnpm db:seed` aplicados nele.
// Nunca aponta para o banco do demo (plexu).
const PORTA = Number(process.env.E2E_PORT ?? 3200);

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORTA}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: process.env.E2E_CMD ?? `node node_modules/next/dist/bin/next dev -p ${PORTA}`,
    url: `http://localhost:${PORTA}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://plexu:plexu@localhost:5433/plexu_e2e",
      APP_SECRET: process.env.APP_SECRET ?? "segredo-e2e-com-mais-de-16-caracteres",
    },
  },
});
