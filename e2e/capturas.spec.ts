// Capturas das 5 telas principais para documentação/PR. Só roda com CAPTURAS=1:
//   CAPTURAS=1 pnpm e2e capturas
// Grava em docs/capturas/*.png (1440x900).
import { test, type Page } from "@playwright/test";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";
const DIR = "docs/capturas";

test.skip(!process.env.CAPTURAS, "capturas só com CAPTURAS=1");
test.use({ viewport: { width: 1440, height: 900 } });

async function capturar(page: Page, nome: string) {
  await page.waitForLoadState("networkidle");
  // esconde o indicador do next dev nas imagens
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: `${DIR}/${nome}.png` });
}

test("capturas das telas", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);
  await capturar(page, "1-boards");

  await page.goto("/w/demo/b/contratos");
  await page.locator("[data-card]").first().waitFor();
  await capturar(page, "2-kanban");

  await page.locator("[data-card]").last().click();
  await page.getByTestId("painel-card").waitFor();
  await capturar(page, "3-card");

  await page.goto("/w/demo/b/contratos/table");
  await page.locator("[data-linha]").first().waitFor();
  await capturar(page, "4-tabela");

  await page.goto("/w/demo/b/contratos/settings?aba=regras");
  await page.getByRole("button", { name: "Nova regra" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Tipo da regra").selectOption("can_enter");
  await dlg.getByLabel("Fase da regra").selectOption({ label: "Vigente" });
  await dlg.getByRole("button", { name: "Condição", exact: true }).click();
  await dlg.getByRole("button", { name: "Condição", exact: true }).click();
  const linhas = dlg.locator("[data-condicao]");
  await linhas.nth(0).getByLabel("Campo").selectOption({ label: "Objeto" });
  await linhas.nth(0).getByLabel("Operador").selectOption({ label: "está preenchido" });
  await linhas.nth(1).getByLabel("Campo").selectOption({ label: "Valor global" });
  await linhas.nth(1).getByLabel("Operador").selectOption({ label: "maior que" });
  await linhas.nth(1).getByLabel("Valor").fill("10000");
  await capturar(page, "5-configuracoes-regra");
});
