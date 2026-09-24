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

test("campos agrupados por fase: mudar a fase pela coluna e arrastando entre grupos", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);
  await page.goto("/w/demo/b/contratos/settings?aba=campos");

  const grupo = (titulo: string) => page.locator(`[data-grupo-fase="${titulo}"]`);
  const cnpj = (titulo: string) => grupo(titulo).locator('[data-config-campo="cnpj"]');
  await expect(cnpj("Preenchidos em Elaboração")).toBeVisible();
  await expect(grupo("Preenchidos em Vigente").locator('[data-config-campo="valor_pago"]')).toBeVisible();
  await expect(grupo("Em todas as fases").locator('[data-config-campo="parcelas"]')).toBeVisible();

  // Coluna "Fase"
  const salvou = acaoConcluida(page);
  await page.getByLabel("Fase de CNPJ").selectOption({ label: "Vigente" });
  await salvou;
  await expect(cnpj("Preenchidos em Vigente")).toBeVisible();
  await page.reload();
  await expect(cnpj("Preenchidos em Vigente")).toBeVisible();

  // Arrastar para "Em todas as fases"
  await arrastar(page, page.getByRole("button", { name: "Arrastar CNPJ" }), grupo("Em todas as fases"));
  await expect(cnpj("Em todas as fases")).toBeVisible();
  await page.reload();
  await expect(cnpj("Em todas as fases")).toBeVisible();
  await expect(page.getByLabel("Fase de CNPJ")).toHaveValue("");

  // Modal do campo em linguagem de usuário; CEL recolhido em "Avançado"
  await page.getByRole("button", { name: "Editar CNPJ" }).click();
  const modal = page.getByRole("dialog", { name: /Editar campo/ });
  await expect(modal.getByText("Este campo é preenchido na fase…")).toBeVisible();
  await expect(modal.getByRole("radiogroup", { name: "Obrigatório" }).getByRole("radio", { name: "nunca" })).toBeVisible();
  await expect(modal.getByLabel("Slug do campo")).toBeHidden();
  await modal.getByLabel("Fase do campo").selectOption({ label: "Elaboração" });
  await modal.getByRole("button", { name: "Salvar campo" }).click();
  await expect(modal).toBeHidden();
  await expect(cnpj("Preenchidos em Elaboração")).toBeVisible();
});
