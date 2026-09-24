// Painel do card (seed "demo"): 3 colunas; relações no formulário da fase (1:N sub-tabela, N:1 seletor
// com busca); aba "Relacionados" só com relações inversas; fases anteriores em leitura com "editar"
// quando permitido (editable_everywhere). Abaixo de 1100px as colunas empilham.
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

test("card em 3 colunas: relações no formulário, inversas em Relacionados, fases anteriores com editar", async ({ page }) => {
  test.setTimeout(300_000); // fluxo longo; no modo dev cada rota compila na primeira visita
  await page.setViewportSize({ width: 1400, height: 900 });
  await entrar(page);
  await page.goto("/w/demo/b/contratos");
  await page.getByRole("button", { name: "Novo card", exact: true }).click();
  const novo = page.getByRole("dialog", { name: "Novo card" });
  await novo.getByLabel("Objeto").fill("Contrato em 3 colunas (e2e)");
  await novo.getByLabel("Contratante").fill("Construtora Colunas");
  await novo.getByRole("button", { name: "Criar card" }).click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);
  const urlContrato = page.url();

  const painel = page.getByTestId("painel-card");
  const anteriores = painel.getByTestId("coluna-anteriores");
  const atual = painel.getByTestId("coluna-atual");
  const lateral = painel.getByTestId("coluna-lateral");

  // Três colunas lado a lado
  const [a, b, c] = [await caixa(anteriores), await caixa(atual), await caixa(lateral)];
  expect(a.x).toBeLessThan(b.x);
  expect(b.x).toBeLessThan(c.x);
  expect(Math.abs(a.y - b.y)).toBeLessThan(5);

  // Relações no formulário da fase, na posição de cada campo; sem inversas, sem aba Relacionados
  await expect(anteriores).toContainText("Nada preenchido em fases anteriores");
  await expect(atual.locator('[data-campo="Objeto"]').getByRole("textbox")).toHaveValue("Contrato em 3 colunas (e2e)");
  const ordem = await atual.locator("[data-campo]").evaluateAll((els) => els.map((e) => e.getAttribute("data-campo")));
  expect(ordem.indexOf("CNPJ")).toBeLessThan(ordem.indexOf("Parcelas"));
  expect(ordem.indexOf("Parcelas")).toBeLessThan(ordem.indexOf("Qtd. parcelas"));
  await expect(painel.getByRole("tab", { name: /Relacionados/ })).toHaveCount(0);

  // N:1: seletor com busca
  const fornecedor = atual.locator('[data-campo="Fornecedor"]');
  await fornecedor.getByLabel("Ligar Fornecedor").fill("Delta");
  await fornecedor.getByRole("option", { name: /Engenharia Delta/ }).getByRole("button").click();
  await expect(fornecedor.getByRole("link", { name: "Engenharia Delta" })).toBeVisible();
  await expect(fornecedor.getByLabel("Ligar Fornecedor")).toHaveCount(0); // um só card

  // 1:N: sub-tabela inline; o salvar do formulário continua funcionando ao lado dela
  const parcelas = atual.locator('[data-subtabela="Parcelas"]');
  await parcelas.getByLabel("Valor", { exact: true }).fill("700");
  await parcelas.getByRole("button", { name: "Adicionar" }).click();
  await expect(parcelas.locator("[data-linha]")).toHaveCount(1);
  await atual.locator('[data-campo="CNPJ"]').getByRole("textbox").fill("11.222.333/0001-81");
  await atual.getByRole("button", { name: "Salvar campos" }).click();
  await expect(page.getByText("Campos salvos")).toBeVisible();

  // Mover: bloqueado com o motivo até medir a parcela
  const vigente = lateral.locator('[data-mover="Vigente"]');
  await expect(vigente.getByRole("button", { name: "Mover para Vigente" })).toBeDisabled();
  await expect(vigente).toContainText("Todas as parcelas precisam estar medidas");
  const medida = parcelas.locator("[data-linha]").getByLabel(/^Medida de /);
  await medida.check();
  await expect(medida).toBeEnabled();
  await expect(vigente.getByRole("button", { name: "Mover para Vigente" })).toBeEnabled();
  await vigente.getByRole("button", { name: "Mover para Vigente" }).click();
  await expect(page.getByTestId("fase-card")).toHaveText("Vigente");

  // Fases anteriores: leitura; "editar" só onde permitido (Contratante tem editable_everywhere)
  const elaboracao = anteriores.locator('[data-fase-anterior="Elaboração"]');
  const objeto = elaboracao.locator('[data-campo-anterior="Objeto"]');
  const contratante = elaboracao.locator('[data-campo-anterior="Contratante"]');
  await expect(objeto).toContainText("Contrato em 3 colunas (e2e)");
  await expect(objeto.getByRole("button", { name: "Editar Objeto" })).toHaveCount(0);
  await expect(elaboracao.locator('[data-campo-anterior="Fornecedor"]')).toContainText("Engenharia Delta");
  await expect(atual.locator('[data-campo="Objeto"]')).toHaveCount(0);
  await expect(atual.locator('[data-campo="Valor pago"]')).toBeVisible();
  await expect(lateral.getByRole("button", { name: "Voltar para Elaboração" })).toBeEnabled();

  await contratante.getByRole("button", { name: "Editar Contratante" }).click();
  await contratante.getByLabel("Contratante").fill("Construtora Colunas S.A.");
  await contratante.getByRole("button", { name: "Salvar" }).click();
  await expect(contratante).toContainText("Construtora Colunas S.A.");
  await expect(contratante.getByRole("button", { name: "Editar Contratante" })).toBeVisible();
  await page.reload();
  await expect(contratante).toContainText("Construtora Colunas S.A.");

  // Recolher o grupo da fase anterior
  await elaboracao.locator("summary").click();
  await expect(objeto).toBeHidden();

  // Abaixo de 1100px as colunas empilham
  await page.setViewportSize({ width: 1000, height: 900 });
  const [a2, b2, c2] = [await caixa(anteriores), await caixa(atual), await caixa(lateral)];
  expect(a2.y).toBeLessThan(b2.y);
  expect(b2.y).toBeLessThan(c2.y);
  expect(Math.abs(a2.x - b2.x)).toBeLessThan(5);

  // No fornecedor, "Relacionados" mostra a relação inversa, agrupada por board/campo
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(urlContrato);
  await anteriores.locator('[data-campo-anterior="Fornecedor"]').getByRole("link", { name: "Engenharia Delta" }).click();
  await page.waitForURL(/\/b\/fornecedores\/c\//);
  await painel.getByRole("tab", { name: /Relacionados/ }).click();
  const inversa = painel.locator('[data-inversa="Contratos · Fornecedor"]');
  await expect(inversa).toBeVisible();
  await expect(inversa.getByRole("link", { name: /CT-/ })).toHaveCount(1);
});
