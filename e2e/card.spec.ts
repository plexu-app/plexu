// Painel do card em 3 colunas (seed "demo"): fases anteriores em leitura, formulário da fase atual e
// coluna de mover com o motivo do bloqueio. Abaixo de 1100px as colunas empilham.
import { expect, test, type Locator, type Page } from "@playwright/test";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);
}

const caixa = async (l: Locator) => (await l.boundingBox())!;

test("card em 3 colunas: mover mostra o motivo do bloqueio; depois de mover, a fase anterior vira leitura", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await entrar(page);
  await page.goto("/w/demo/b/contratos");
  await page.getByRole("button", { name: "Novo card", exact: true }).click();
  const novo = page.getByRole("dialog", { name: "Novo card" });
  await novo.getByLabel("Objeto").fill("Contrato em 3 colunas (e2e)");
  await novo.getByLabel("Contratante").fill("Construtora Colunas");
  await novo.getByRole("button", { name: "Criar card" }).click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);

  const painel = page.getByTestId("painel-card");
  const anteriores = painel.getByTestId("coluna-anteriores");
  const atual = painel.getByTestId("coluna-atual");
  const lateral = painel.getByTestId("coluna-lateral");

  // Três colunas lado a lado
  const [a, b, c] = [await caixa(anteriores), await caixa(atual), await caixa(lateral)];
  expect(a.x).toBeLessThan(b.x);
  expect(b.x).toBeLessThan(c.x);
  expect(Math.abs(a.y - b.y)).toBeLessThan(5);

  // Primeira fase: nada anterior; Objeto editável no centro; mover bloqueado com o motivo
  await expect(anteriores).toContainText("Nada preenchido em fases anteriores");
  await expect(atual.locator('[data-campo="Objeto"]').getByRole("textbox")).toHaveValue("Contrato em 3 colunas (e2e)");
  const vigente = lateral.locator('[data-mover="Vigente"]');
  await expect(vigente.getByRole("button", { name: "Mover para Vigente" })).toBeDisabled();
  await expect(vigente).toContainText("Todas as parcelas precisam estar medidas");

  // Uma parcela medida libera o movimento
  await painel.getByRole("tab", { name: /Relacionados/ }).click();
  const parcelas = painel.locator('[data-subtabela="Parcelas"]');
  await parcelas.getByLabel("Valor", { exact: true }).fill("700");
  await parcelas.getByRole("button", { name: "Adicionar" }).click();
  await expect(parcelas.locator("[data-linha]")).toHaveCount(1);
  const medida = parcelas.locator("[data-linha]").getByLabel(/^Medida de /);
  await medida.check();
  await expect(medida).toBeEnabled();
  await expect(vigente.getByRole("button", { name: "Mover para Vigente" })).toBeEnabled();
  await vigente.getByRole("button", { name: "Mover para Vigente" }).click();
  await expect(page.getByTestId("fase-card")).toHaveText("Vigente");

  // Na Vigência: dados da Elaboração em leitura à esquerda; "Valor pago" (origem Vigente) no centro
  const elaboracao = anteriores.locator('[data-fase-anterior="Elaboração"]');
  await expect(elaboracao.locator('[data-campo-anterior="Objeto"]')).toContainText("Contrato em 3 colunas (e2e)");
  await expect(elaboracao.locator('[data-campo-anterior="Contratante"]')).toContainText("Construtora Colunas");
  await expect(atual.locator('[data-campo="Objeto"]')).toHaveCount(0);
  await expect(atual.locator('[data-campo="Valor pago"]')).toBeVisible();
  await expect(lateral.getByRole("button", { name: "Voltar para Elaboração" })).toBeEnabled();

  // Recolher o grupo da fase anterior
  await elaboracao.locator("summary").click();
  await expect(elaboracao.locator('[data-campo-anterior="Objeto"]')).toBeHidden();

  // Abaixo de 1100px as colunas empilham
  await page.setViewportSize({ width: 1000, height: 900 });
  const [a2, b2, c2] = [await caixa(anteriores), await caixa(atual), await caixa(lateral)];
  expect(a2.y).toBeLessThan(b2.y);
  expect(b2.y).toBeLessThan(c2.y);
  expect(Math.abs(a2.x - b2.x)).toBeLessThan(5);
});
