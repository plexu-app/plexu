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
  await page.mouse.move(b.x + b.width / 2, b.y + 120, { steps: 20 });
  const resposta = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);
  await page.mouse.up();
  await resposta;
}

test("contrato com 2 parcelas: mover sem medir é bloqueado; depois de medir, move", async ({ page }) => {
  // Login
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);

  // Novo card em Contratos
  await page.getByRole("link", { name: /Contratos/ }).click();
  await page.waitForURL(/\/b\/contratos$/);
  await page.locator('[data-fase="Elaboração"]').getByRole("button", { name: "Novo card" }).click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);
  const urlCard = page.url();
  const cardId = urlCard.split("/").pop()!;
  await expect(page.getByTestId("titulo-card")).toHaveText(/^CT-\d{4}\/\d{4}$/);

  // Objeto é obrigatório em Elaboração
  await page.getByLabel("Objeto").fill("Obra do teste e2e");
  await page.getByRole("button", { name: "Salvar campos" }).click();
  await expect(page.getByText("Campos salvos")).toBeVisible();

  // Duas parcelas criadas a partir do contrato (sub-tabela)
  const parcelas = page.locator('[data-subtabela="Parcelas"]');
  for (const [i, valor] of ["1000", "500,50"].entries()) {
    await parcelas.getByLabel("Valor", { exact: true }).fill(valor);
    await parcelas.getByRole("button", { name: "Adicionar" }).click();
    await expect(parcelas.locator("[data-linha]")).toHaveCount(i + 1);
  }
  await expect(page.locator('[data-campo="Valor global"]')).toContainText("1.500,50");
  await expect(page.locator('[data-campo="Qtd. parcelas"]')).toContainText("2");

  // Tentar mover sem medir: bloqueado, toast com o motivo, card volta para Elaboração
  await page.goto(urlCard.replace(/\/c\/.*/, ""));
  const noKanban = (fase: string) => page.locator(`[data-fase="${fase}"] [data-card="${cardId}"]`);
  await expect(noKanban("Elaboração")).toBeVisible();
  await arrastar(page, noKanban("Elaboração"), page.locator('[data-fase="Vigente"]'));
  await expect(page.getByText("Todas as parcelas precisam estar medidas")).toBeVisible();
  await expect(noKanban("Elaboração")).toBeVisible();
  await expect(noKanban("Vigente")).toHaveCount(0);

  // Medir as duas parcelas
  await page.goto(urlCard);
  const medidas = parcelas.locator("[data-linha]").getByLabel(/^Medida de /);
  await expect(medidas).toHaveCount(2);
  for (const i of [0, 1]) {
    await medidas.nth(i).check();
    await expect(medidas.nth(i)).toBeChecked();
    await expect(medidas.nth(i)).toBeEnabled();
  }

  // Mover de novo: agora passa
  await page.goto(urlCard.replace(/\/c\/.*/, ""));
  await expect(noKanban("Elaboração")).toBeVisible();
  await arrastar(page, noKanban("Elaboração"), page.locator('[data-fase="Vigente"]'));
  await expect(noKanban("Vigente")).toBeVisible();
  await page.reload();
  await expect(noKanban("Vigente")).toBeVisible();

  // Histórico registra a movimentação
  await page.goto(urlCard);
  await expect(page.getByTestId("historico")).toContainText("moveu de Elaboração para Vigente");
});
