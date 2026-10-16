// Capturas do redesign para o PR (docs/design/prompt-redesign-pr2.md), claro e escuro, 1440x900.
// Só roda com CAPTURAS=1; de preferência contra o build de produção:
//   CAPTURAS=1 E2E_PORT=3300 pnpm e2e visual
// Grava em e2e/__screenshots__/pr2/<tela>-<tema>.png, com os dados do seed "demo".
import { test, type Page } from "@playwright/test";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";
const DIR = "e2e/__screenshots__/pr2";

test.skip(!process.env.CAPTURAS, "capturas só com CAPTURAS=1");
test.use({ viewport: { width: 1440, height: 900 } });

async function entrar(page: Page, tema: "light" | "dark") {
  await page.addInitScript((t) => localStorage.setItem("plexu-theme", t), tema);
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);
}

async function capturar(page: Page, nome: string, tema: string) {
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // indicador do next dev
  await page.screenshot({ path: `${DIR}/${nome}-${tema === "light" ? "claro" : "escuro"}.png` });
}

for (const tema of ["light", "dark"] as const) {
  test.describe(`telas (${tema})`, () => {
    test.beforeEach(async ({ page }) => entrar(page, tema));

    test("A: kanban", async ({ page }) => {
      await page.goto("/w/demo/b/pedidos");
      await page.locator("[data-card]").first().waitFor();
      await capturar(page, "a-kanban", tema);
    });

    test("A: lista", async ({ page }) => {
      await page.goto("/w/demo/b/pedidos/table");
      await page.locator("[data-linha]").first().waitFor();
      await capturar(page, "a-lista", tema);
    });

    test("B: card aberto", async ({ page }) => {
      await page.goto("/w/demo/b/pedidos");
      await page.locator("[data-card]").filter({ hasText: "PD-0004" }).click();
      await page.getByTestId("titulo-card").waitFor();
      await capturar(page, "b-card-aberto", tema);
    });

    test("C: config de fase", async ({ page }) => {
      await page.goto("/w/demo/b/pedidos/settings?aba=fases");
      await page.locator("[data-campo-formulario]").first().waitFor();
      await capturar(page, "c-config-fase", tema);
    });

    test("C: editor de campo", async ({ page }) => {
      await page.goto("/w/demo/b/pedidos/settings");
      const ref = page.locator('[data-campo-formulario="Referência"]');
      await ref.hover();
      await ref.getByRole("button", { name: "Editar Referência" }).click();
      await page.locator("[data-editor-campo]").waitFor();
      await capturar(page, "c-editor-campo", tema);
    });

    test("C: lista de automações", async ({ page }) => {
      await page.goto("/w/demo/b/pedidos/automacoes");
      await page.locator("[data-automacao]").first().waitFor();
      await capturar(page, "c-automacoes", tema);
    });

    test("C: editor de automação", async ({ page }) => {
      await page.goto("/w/demo/b/pedidos/automacoes");
      await page.locator("[data-automacao] a").first().click();
      await page.locator("[data-editor-automacao]").waitFor();
      await capturar(page, "c-editor-automacao", tema);
    });
  });
}
