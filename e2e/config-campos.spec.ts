// Settings → Campos agrupados pela fase de origem: coluna "Fase" e arrastar entre grupos (seed "demo").
// Restaura o estado no fim para não interferir nos outros testes.
import { expect, test, type Locator, type Page } from "@playwright/test";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";

const acaoConcluida = (page: Page) => page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);

async function arrastar(page: Page, origem: Locator, destino: Locator) {
  const a = (await origem.boundingBox())!;
  const b = (await destino.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  const resposta = acaoConcluida(page);
  await page.mouse.up();
  await resposta;
}

test("campos agrupados pela primeira fase: chips de fases, arrastar entre grupos e modal", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);
  await page.goto("/w/demo/b/contratos/settings?aba=campos");

  const grupo = (titulo: string) => page.locator(`[data-grupo-fase="${titulo}"]`);
  const cnpj = (titulo: string) => grupo(titulo).locator('[data-config-campo="cnpj"]');
  const chips = page.locator('[data-preenchido-em="CNPJ"] [data-chip-fase]');
  await expect(cnpj("A partir de Elaboração")).toBeVisible();
  await expect(grupo("A partir de Vigente").locator('[data-config-campo="valor_pago"]')).toBeVisible();
  await expect(grupo("Em todas as fases").locator('[data-config-campo="parcelas"]')).toBeVisible();
  await expect(chips).toHaveText(["Elaboração"]);

  // Chips: marcar Vigente também; o agrupamento continua pela primeira fase
  await page.getByLabel("Preenchido em: CNPJ").click();
  const opcoes = page.getByRole("group", { name: "Fases de CNPJ" });
  let salvou = acaoConcluida(page);
  await opcoes.getByLabel("Vigente").check();
  await salvou;
  await expect(chips).toHaveText(["Elaboração", "Vigente"]);
  await expect(cnpj("A partir de Elaboração")).toBeVisible();

  // Desmarcar Elaboração: passa a começar em Vigente
  salvou = acaoConcluida(page);
  await opcoes.getByLabel("Elaboração").uncheck();
  await salvou;
  await page.reload();
  await expect(cnpj("A partir de Vigente")).toBeVisible();
  await expect(chips).toHaveText(["Vigente"]);

  // Arrastar para "Em todas as fases"
  await arrastar(page, page.getByRole("button", { name: "Arrastar CNPJ" }), grupo("Em todas as fases"));
  await expect(cnpj("Em todas as fases")).toBeVisible();
  await page.reload();
  await expect(cnpj("Em todas as fases")).toBeVisible();
  await expect(page.locator('[data-preenchido-em="CNPJ"]')).toContainText("todas as fases");

  // Modal: "Preenchido nas fases…" (multi) e "Pode ser editado em qualquer fase depois disso"
  await page.getByRole("button", { name: "Editar CNPJ" }).click();
  const modal = page.getByRole("dialog", { name: /Editar campo/ });
  const fasesModal = modal.getByRole("group", { name: "Preenchido nas fases" });
  const sempre = modal.getByLabel("Pode ser editado em qualquer fase depois disso");
  await expect(modal.getByText("Preenchido nas fases…")).toBeVisible();
  await expect(sempre).toBeDisabled();
  await expect(modal.getByLabel("Slug do campo")).toBeHidden();
  await fasesModal.getByLabel("Elaboração").check();
  await expect(sempre).toBeEnabled();
  await modal.getByRole("button", { name: "Salvar campo" }).click();
  await expect(modal).toBeHidden();
  await expect(cnpj("A partir de Elaboração")).toBeVisible();
  await expect(chips).toHaveText(["Elaboração"]);
});
