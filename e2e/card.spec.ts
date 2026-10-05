// Painel do card (seed "demo"): 3 colunas; relações no formulário da fase (1:N sub-tabela, N:1 seletor
// com busca); aba "Relacionados" só com relações inversas; fases anteriores em leitura com "editar"
// quando permitido (editable_everywhere). Abaixo de 1100px as colunas empilham.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { anexarComprovante } from "./apoio";

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
  await page.goto("/w/demo/b/pedidos");
  await page.getByRole("button", { name: "Novo cartão", exact: true }).click();
  const novo = page.getByRole("dialog", { name: "Novo cartão" });
  await novo.getByLabel("Referência").fill("Pedido em 3 colunas (e2e)");
  await novo.getByLabel("Contato").fill("Compras Colunas");
  await anexarComprovante(novo);
  await novo.getByRole("button", { name: "Criar cartão" }).click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);
  const urlPedido = page.url();

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
  await expect(atual.locator('[data-campo="Referência"]').getByRole("textbox")).toHaveValue("Pedido em 3 colunas (e2e)");
  const ordem = await atual.locator("[data-campo]").evaluateAll((els) => els.map((e) => e.getAttribute("data-campo")));
  expect(ordem.indexOf("CNPJ")).toBeLessThan(ordem.indexOf("Itens"));
  expect(ordem.indexOf("Itens")).toBeLessThan(ordem.indexOf("Qtd. itens"));
  await expect(painel.getByRole("tab", { name: /Relacionados/ })).toHaveCount(0);

  // N:1: seletor com busca
  const cliente = atual.locator('[data-campo="Cliente"]');
  await cliente.getByLabel("Ligar Cliente").fill("Horizonte");
  await cliente.getByRole("option", { name: /Loja Horizonte/ }).getByRole("button").click();
  await expect(cliente.getByRole("link", { name: "Loja Horizonte" })).toBeVisible();
  await expect(cliente.getByLabel("Ligar Cliente")).toHaveCount(0); // um só card

  // 1:N: sub-tabela inline; o salvar do formulário continua funcionando ao lado dela
  const itens = atual.locator('[data-subtabela="Itens"]');
  await itens.getByLabel("Valor", { exact: true }).fill("700");
  await itens.getByRole("button", { name: "Adicionar" }).click();
  await expect(itens.locator("[data-linha]")).toHaveCount(1);
  // Salvamento automático: sem botão; erro mantém o valor com a mensagem; corrigir salva sozinho
  await expect(atual.getByRole("button", { name: "Salvar campos" })).toHaveCount(0);
  const cnpj = atual.locator('[data-campo="CNPJ"]');
  await cnpj.getByRole("textbox").fill("11.222.333/0001-00");
  await cnpj.getByRole("textbox").press("Tab");
  await expect(cnpj).toHaveAttribute("data-salvamento", "erro");
  await expect(cnpj.locator("[data-erro-campo]")).toContainText(/CNPJ/i);
  await expect(cnpj.getByRole("textbox")).toHaveValue("11.222.333/0001-00");
  await cnpj.getByRole("textbox").fill("11.222.333/0001-81");
  await expect(cnpj).toHaveAttribute("data-salvamento", "salvo"); // depois de 500 ms sem digitar
  await expect(cnpj.locator("[data-erro-campo]")).toHaveCount(0);

  // Enviar: bloqueado com o motivo até separar o item
  const enviado = lateral.locator('[data-mover="Enviado"]');
  await expect(enviado.getByRole("button", { name: "Mover para Enviado" })).toBeDisabled();
  await expect(enviado).toContainText("Todos os itens precisam estar separados");
  const separado = itens.locator("[data-linha]").getByLabel(/^Separado de /);
  await separado.check();
  await expect(separado).toBeEnabled();
  await expect(enviado.getByRole("button", { name: "Mover para Enviado" })).toBeEnabled();
  await enviado.getByRole("button", { name: "Mover para Enviado" }).click();
  await expect(page.getByTestId("fase-card")).toHaveText("Enviado");

  // Fases anteriores: leitura; "editar" só onde permitido (Contato tem editable_everywhere)
  const faseNovo = anteriores.locator('[data-fase-anterior="Novo"]');
  const referencia = faseNovo.locator('[data-campo-anterior="Referência"]');
  const contato = faseNovo.locator('[data-campo-anterior="Contato"]');
  await expect(referencia).toContainText("Pedido em 3 colunas (e2e)");
  await expect(referencia.getByRole("button", { name: "Editar Referência" })).toHaveCount(0);
  await expect(faseNovo.locator('[data-campo-anterior="Cliente"]')).toContainText("Loja Horizonte");
  await expect(atual.locator('[data-campo="Referência"]')).toHaveCount(0);
  await expect(atual.locator('[data-campo="Valor enviado"]')).toBeVisible();
  await expect(lateral.getByRole("button", { name: "Voltar para Novo" })).toBeEnabled();

  await contato.getByRole("button", { name: "Editar Contato" }).click();
  await contato.getByLabel("Contato").fill("Compras Colunas Ltda.");
  await contato.getByRole("button", { name: "Salvar" }).click();
  await expect(contato).toContainText("Compras Colunas Ltda.");
  await expect(contato.getByRole("button", { name: "Editar Contato" })).toBeVisible();
  await page.reload();
  await expect(contato).toContainText("Compras Colunas Ltda.");

  // Recolher o grupo da fase anterior
  await faseNovo.locator("summary").click();
  await expect(referencia).toBeHidden();

  // Abaixo de 1100px as colunas empilham
  await page.setViewportSize({ width: 1000, height: 900 });
  const [a2, b2, c2] = [await caixa(anteriores), await caixa(atual), await caixa(lateral)];
  expect(a2.y).toBeLessThan(b2.y);
  expect(b2.y).toBeLessThan(c2.y);
  expect(Math.abs(a2.x - b2.x)).toBeLessThan(5);

  // No cliente, "Relacionados" mostra a relação inversa, agrupada por board/campo
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(urlPedido);
  await anteriores.locator('[data-campo-anterior="Cliente"]').getByRole("link", { name: "Loja Horizonte" }).click();
  await page.waitForURL(/\/b\/clientes\/c\//);
  await painel.getByRole("tab", { name: /Relacionados/ }).click();
  const inversa = painel.locator('[data-inversa="Pedidos · Cliente"]');
  await expect(inversa).toBeVisible();
  // O cliente acumula pedidos de outras execuções: confere o deste teste, pelo link do card.
  const idPedido = urlPedido.split("/c/")[1];
  await expect(inversa.locator(`a[href$="/c/${idPedido}"]`)).toHaveCount(1);
  await expect(inversa.locator(`a[href$="/c/${idPedido}"]`)).toContainText("PD-");
});
