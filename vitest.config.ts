import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Testes de integração do core usam Postgres real (DATABASE_URL); concorrência pede folga.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
