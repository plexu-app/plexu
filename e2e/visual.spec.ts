// Capturas do redesign (docs/DESIGN.md) para comparar com docs/design/plexu-mockups.html e ilustrar o PR.
// Só roda com CAPTURAS=1:  CAPTURAS=1 pnpm e2e visual
// Grava em e2e/__screenshots__/*.png (1440x900), com os dados do seed "demo".
import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";
const DIR = "e2e/__screenshots__";

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

async function capturar(page: Page, nome: string) {
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // indicador do next dev
  await page.screenshot({ path: `${DIR}/${nome}.png` });
}

for (const tema of ["light", "dark"] as const) {
  test(`kanban de Entregas (${tema})`, async ({ page }) => {
    await entrar(page, tema);
    await page.goto("/w/demo/b/entregas");
    await page.locator("[data-card]").first().waitFor();
    await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
    await capturar(page, `kanban-${tema === "light" ? "claro" : "escuro"}`);
  });
}

test("sidebar recolhida", async ({ page }) => {
  await entrar(page, "light");
  await page.goto("/w/demo/b/pedidos");
  await page.locator("[data-card]").first().waitFor();
  await page.getByRole("button", { name: "Recolher barra lateral" }).click();
  await expect.poll(async () => (await page.getByRole("complementary", { name: "Navegação" }).boundingBox())!.width).toBeLessThan(80);
  await capturar(page, "sidebar-recolhida");
});

test("modal de novo cartão", async ({ page }) => {
  await entrar(page, "light");
  await page.goto("/w/demo/b/pedidos");
  await page.getByRole("button", { name: "Novo cartão", exact: true }).click();
  await page.getByRole("dialog", { name: "Novo cartão" }).waitFor();
  await capturar(page, "modal-novo-cartao");
});
