// Caso de aceitação do MVP (seed "demo"): contrato → parcelas → regra de saída.
import { expect, test, type Locator, type Page } from "@playwright/test";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";

/** Arrasta com o mouse em passos (o PointerSensor do dnd-kit exige movimento) e espera a server action responder. */
async function arrastar(page: Page, origem: Locator, destino: Locator) {
  const a = await origem.boundingBox();
  const b = await destino.boundingBox();
  if (!a || !b) throw new Error("elemento sem posição na tela");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 10, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + 60, { steps: 20 });
  const resposta = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);
  await page.mouse.up();
  await resposta;
}

test("contrato com 2 parcelas: mover sem medir é bloqueado; depois de medir, move", async ({ page }) => {
  // Login e navegação pela sidebar
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);
  await page.getByRole("complementary", { name: "Navegação" }).getByRole("link", { name: "Contratos" }).click();
  await page.waitForURL(/\/b\/contratos$/);

  // Criar card = formulário da fase inicial (modal); vazio é recusado
  await page.getByRole("button", { name: "Novo card", exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Fase: Elaboração")).toBeVisible();
  await modal.getByRole("button", { name: "Criar card" }).click();
  await expect(modal.locator("[data-campo-novo=\"Objeto\"]").getByText("Obrigatório nesta fase")).toBeVisible();
  await modal.getByLabel("Objeto").fill("Obra do teste e2e");
  await modal.getByLabel("Contratante").fill("Construtora E2E");
  await modal.getByRole("button", { name: "Criar card" }).click();

  // Card abre no painel lateral, com URL própria
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);
  const urlCard = page.url();
  const cardId = urlCard.split("/").pop()!;
  const painel = page.getByTestId("painel-card");
  await expect(painel).toBeVisible();
  await expect(page.getByTestId("titulo-card")).toHaveText(/^CT-\d{4}\/\d{4}$/);
  await expect(page.getByTestId("fase-card")).toHaveText("Elaboração");

  // Duas parcelas pela aba Relacionados (sub-tabela)
  await painel.getByRole("tab", { name: /Relacionados/ }).click();
  const parcelas = painel.locator('[data-subtabela="Parcelas"]');
  for (const [i, valor] of ["1000", "500,50"].entries()) {
    await parcelas.getByLabel("Valor", { exact: true }).fill(valor);
    await parcelas.getByRole("button", { name: "Adicionar" }).click();
    await expect(parcelas.locator("[data-linha]")).toHaveCount(i + 1);
  }
  await painel.getByRole("tab", { name: "Campos" }).click();
  await expect(painel.locator('[data-campo="Valor global"]')).toContainText("1.500,50");

  // Fechar volta ao board; mover sem medir é bloqueado (toast com o motivo, card volta)
  await page.keyboard.press("Escape");
  await page.waitForURL(/\/b\/contratos$/);
  const noKanban = (fase: string) => page.locator(`[data-fase="${fase}"] [data-card="${cardId}"]`);
  await expect(noKanban("Elaboração")).toBeVisible();
  await arrastar(page, noKanban("Elaboração"), page.locator('[data-fase="Vigente"]'));
  await expect(page.getByText("Todas as parcelas precisam estar medidas")).toBeVisible();
  await expect(noKanban("Elaboração")).toBeVisible();
  await expect(noKanban("Vigente")).toHaveCount(0);

  // Medir as duas parcelas a partir do painel
  await noKanban("Elaboração").click();
  await expect(painel).toBeVisible();
  await painel.getByRole("tab", { name: /Relacionados/ }).click();
  const medidas = parcelas.locator("[data-linha]").getByLabel(/^Medida de /);
  await expect(medidas).toHaveCount(2);
  for (const i of [0, 1]) {
    await medidas.nth(i).check();
    await expect(medidas.nth(i)).toBeChecked();
    await expect(medidas.nth(i)).toBeEnabled();
  }
  await page.keyboard.press("Escape");
  await page.waitForURL(/\/b\/contratos$/);

  // Mover de novo: agora passa
  await expect(noKanban("Elaboração")).toBeVisible();
  await arrastar(page, noKanban("Elaboração"), page.locator('[data-fase="Vigente"]'));
  await expect(noKanban("Vigente")).toBeVisible();
  await page.reload();
  await expect(noKanban("Vigente")).toBeVisible();

  // Histórico registra a movimentação (URL direta do card)
  await page.goto(urlCard);
  await expect(page.getByTestId("fase-card")).toHaveText("Vigente");
  await painel.getByRole("tab", { name: "Histórico" }).click();
  await expect(page.getByTestId("historico")).toContainText("moveu de Elaboração para Vigente");
});
