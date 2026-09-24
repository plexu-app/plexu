// Criação de cards: campos condicionais avaliados ao vivo no modal e sub-tabela que abre o formulário
// completo do board filho quando o "Adicionar" rápido não cobre os obrigatórios (seed "demo").
import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);
}

test("modal de criação: campo condicional aparece e passa a ser obrigatório conforme o preenchimento", async ({ page }) => {
  await entrar(page);
  await page.goto("/w/demo/b/contratos");
  await page.getByRole("button", { name: "Novo card", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Novo card" });

  const garantia = modal.locator('[data-campo-novo="Valor da garantia"]');
  await expect(garantia).toHaveCount(0);
  await modal.getByLabel("Objeto").fill("Contrato com garantia (e2e)");
  await modal.getByLabel("Exige garantia").check();
  await expect(garantia).toBeVisible();
  await expect(garantia.getByText("*")).toBeVisible();

  await modal.getByRole("button", { name: "Criar card" }).click();
  await expect(garantia.getByText("Obrigatório nesta fase")).toBeVisible();

  // Desmarcar esconde de novo; marcar e preencher cria
  await modal.getByLabel("Exige garantia").uncheck();
  await expect(garantia).toHaveCount(0);
  await modal.getByLabel("Exige garantia").check();
  await modal.getByLabel("Valor da garantia").fill("5000");
  await modal.getByRole("button", { name: "Criar card" }).click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("painel-card").locator('[data-campo="Valor da garantia"]')).toBeVisible();
});

test("sub-tabela: sem cobertura dos obrigatórios, Adicionar abre o formulário completo já vinculado ao pai", async ({ page }) => {
  await entrar(page);
  await page.goto("/w/demo/b/contratos");
  await page.getByRole("button", { name: "Novo card", exact: true }).click();
  const novo = page.getByRole("dialog", { name: "Novo card" });
  await novo.getByLabel("Objeto").fill("Contrato com aditivo (e2e)");
  await novo.getByRole("button", { name: "Criar card" }).click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);

  const painel = page.getByTestId("painel-card");
  await painel.getByRole("tab", { name: /Relacionados/ }).click();

  // Parcelas: o formulário rápido cobre os obrigatórios, então continua inline
  await expect(painel.locator('[data-subtabela="Parcelas"]').getByLabel("Valor", { exact: true })).toBeVisible();

  // Aditivos: Descrição (texto longo, obrigatória) não cabe no rápido, então Adicionar abre o modal
  const aditivos = painel.locator('[data-subtabela="Aditivos"]');
  await expect(aditivos.getByLabel("Valor", { exact: true })).toHaveCount(0);
  await aditivos.getByRole("button", { name: "Adicionar em Aditivos" }).click();
  const modal = page.getByRole("dialog", { name: "Novo item em Aditivos" });
  await expect(modal).toBeVisible();
  await modal.getByLabel("Valor").fill("1200");
  await modal.getByRole("button", { name: "Criar card" }).click();
  await expect(modal.locator('[data-campo-novo="Descrição"]').getByText("Obrigatório nesta fase")).toBeVisible();
  await modal.getByLabel("Descrição").fill("Prazo estendido em 30 dias");
  await modal.getByRole("button", { name: "Criar card" }).click();
  await expect(modal).toBeHidden();
  await expect(aditivos.locator("[data-linha]")).toHaveCount(1);
  await expect(aditivos.locator("[data-linha]")).toContainText("1.200,00");
});
