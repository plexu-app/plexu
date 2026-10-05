// Caso de aceitação do MVP (seed "demo"): pedido → itens → regra de entrada em Enviado.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { anexarComprovante } from "./apoio";

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

test("pedido com 2 itens: enviar sem separar é bloqueado; depois de separar, envia", async ({ page }) => {
  // Login e navegação pela sidebar
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);
  await page.getByRole("complementary", { name: "Navegação" }).getByRole("link", { name: "Pedidos" }).click();
  await page.waitForURL(/\/b\/pedidos$/);

  // Criar cartão = formulário da fase inicial (modal); vazio é recusado
  await page.getByRole("button", { name: "Novo cartão", exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Fase: Novo")).toBeVisible();
  await modal.getByRole("button", { name: "Criar cartão" }).click();
  await expect(modal.locator("[data-campo-novo=\"Referência\"]").getByText("Obrigatório nesta fase")).toBeVisible();
  await modal.getByLabel("Referência").fill("Pedido do teste e2e");
  await modal.getByLabel("Contato").fill("Compras E2E");
  await anexarComprovante(modal);
  await modal.getByRole("button", { name: "Criar cartão" }).click();

  // Card abre no painel lateral, com URL própria
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);
  const urlCard = page.url();
  const cardId = urlCard.split("/").pop()!;
  const painel = page.getByTestId("painel-card");
  await expect(painel).toBeVisible();
  await expect(page.getByTestId("titulo-card")).toHaveText(/^PD-\d{4}$/);
  await expect(page.getByTestId("fase-card")).toHaveText("Novo");

  // Dois itens pela sub-tabela, no formulário da fase
  const itens = painel.locator('[data-subtabela="Itens"]');
  for (const [i, valor] of ["1000", "500,50"].entries()) {
    await itens.getByLabel("Valor", { exact: true }).fill(valor);
    await itens.getByRole("button", { name: "Adicionar" }).click();
    await expect(itens.locator("[data-linha]")).toHaveCount(i + 1);
  }
  await expect(painel.locator('[data-campo="Valor total"]')).toContainText("1.500,50");

  // Fechar volta ao board; enviar sem separar é bloqueado (toast com o motivo, card volta)
  await page.keyboard.press("Escape");
  await page.waitForURL(/\/b\/pedidos$/);
  const noKanban = (fase: string) => page.locator(`[data-fase="${fase}"] [data-card="${cardId}"]`);
  await expect(noKanban("Novo")).toBeVisible();
  await arrastar(page, noKanban("Novo"), page.locator('[data-fase="Enviado"]'));
  await expect(page.getByText("Todos os itens precisam estar separados")).toBeVisible();
  await expect(noKanban("Novo")).toBeVisible();
  await expect(noKanban("Enviado")).toHaveCount(0);

  // Separar os dois itens a partir do painel
  await noKanban("Novo").click();
  await expect(painel).toBeVisible();
  const separados = itens.locator("[data-linha]").getByLabel(/^Separado de /);
  await expect(separados).toHaveCount(2);
  for (const i of [0, 1]) {
    await separados.nth(i).check();
    await expect(separados.nth(i)).toBeChecked();
    await expect(separados.nth(i)).toBeEnabled();
  }
  await page.keyboard.press("Escape");
  await page.waitForURL(/\/b\/pedidos$/);

  // Enviar de novo: agora passa
  await expect(noKanban("Novo")).toBeVisible();
  await arrastar(page, noKanban("Novo"), page.locator('[data-fase="Enviado"]'));
  await expect(noKanban("Enviado")).toBeVisible();
  await page.reload();
  await expect(noKanban("Enviado")).toBeVisible();

  // Histórico registra a movimentação (URL direta do card)
  await page.goto(urlCard);
  await expect(page.getByTestId("fase-card")).toHaveText("Enviado");
  await painel.getByRole("tab", { name: "Histórico" }).click();
  await expect(page.getByTestId("historico")).toContainText("moveu de Novo para Enviado");
});
