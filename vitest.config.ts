import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { urlDeTeste } from "./src/test/banco";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Banco próprio dos testes (plexu_test), criado e migrado pelo setup global. Nunca o do demo nem o do e2e.
    env: { DATABASE_URL: urlDeTeste() },
    globalSetup: ["src/test/global-setup.ts"],
    // Testes de integração do core usam Postgres real; concorrência pede folga.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
