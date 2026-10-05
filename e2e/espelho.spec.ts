// Espelho editável (seed "demo"): campo "Valor de card relacionado" configurado pelo modal com
// "Espelhar e permitir editar daqui"; sem card de origem fica somente leitura com o motivo; ligado,
// editar no pedido altera o cliente. Restaura o valor e arquiva o campo no fim.
import { expect, test, type Page } from "@playwright/test";
import { anexarComprovante } from "./apoio";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";
const CNPJ_AURORA = "11.222.333/0001-81";
const CNPJ_NOVO = "76.543.210/0001-98";

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);
}

test("espelho editável: modal em linguagem de usuário, motivo quando não editável, edição grava na origem", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await entrar(page);
  const nome = `CNPJ do cliente ${Date.now().toString(36)}`;

  // Modal do campo: relação, campo de origem por nome, "Vem de" e os três modos
  await page.goto("/w/demo/b/pedidos/settings?aba=campos");
  await page.getByRole("button", { name: "Novo campo" }).click();
  const modal = page.getByRole("dialog", { name: "Novo campo" });
  await modal.getByLabel("Nome do campo").fill(nome);
  await modal.getByLabel("Tipo do campo").selectOption({ label: "Valor de card relacionado" });
  await modal.getByLabel("Relação do valor relacionado").selectOption({ label: "Cliente (deste board)" });
  await modal.getByLabel("Campo do card relacionado").selectOption({ label: "CNPJ" });
  await expect(modal.locator("[data-vem-de]")).toHaveText("Vem de: Clientes → Cliente → CNPJ");
  await expect(modal.getByRole("radio", { name: /Copiar uma vez \(pode divergir depois\)/ })).toBeVisible();
  await expect(modal.getByRole("radio", { name: /^Espelhar \(sempre igual ao card de origem\)/ })).toBeChecked();
  await modal.getByRole("radio", { name: /Espelhar e permitir editar daqui \(altera o card de origem\)/ }).check();
  await modal.getByRole("button", { name: "Salvar campo" }).click();
  await expect(modal).toBeHidden();

  // Pedido novo, sem cliente: somente leitura com o motivo
  await page.goto("/w/demo/b/pedidos");
  await page.getByRole("button", { name: "Novo cartão", exact: true }).click();
  const novo = page.getByRole("dialog", { name: "Novo cartão" });
  await novo.getByLabel("Referência").fill("Pedido com espelho (e2e)");
  await novo.getByLabel("Contato").fill("Compras Espelho");
  await anexarComprovante(novo);
  await novo.getByRole("button", { name: "Criar cartão" }).click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);
  const atual = page.getByTestId("painel-card").getByTestId("coluna-atual");
  const espelho = atual.locator(`[data-campo="${nome}"]`);
  await expect(espelho.getByText("somente leitura")).toHaveAttribute("title", /Sem card de origem ligado/);
  await expect(espelho.getByRole("textbox")).toHaveCount(0);

  // Liga o cliente: o espelho mostra o CNPJ dele e fica editável
  const cliente = atual.locator('[data-campo="Cliente"]');
  await cliente.getByLabel("Ligar Cliente").fill("Aurora");
  await cliente.getByRole("option", { name: /Mercado Aurora/ }).getByRole("button").click();
  await expect(cliente.getByRole("link", { name: "Mercado Aurora" })).toBeVisible();
  await page.reload();
  await expect(espelho.locator("[data-origem-espelho]")).toContainText("editar aqui altera a origem");
  await expect(espelho.getByRole("textbox")).toHaveValue(CNPJ_AURORA);

  // Edita no pedido → grava no cliente
  const salvar = async (valor: string) => {
    await espelho.getByRole("textbox").fill(valor);
    await espelho.getByRole("textbox").press("Tab");
    await expect(espelho).toHaveAttribute("data-salvamento", "salvo");
  };
  await salvar(CNPJ_NOVO);
  await page.goto("/w/demo/b/clientes");
  await expect(page.getByRole("row", { name: /Mercado Aurora/ })).toContainText(CNPJ_NOVO);

  // Restaura: volta o CNPJ pelo espelho e arquiva o campo
  await page.goBack();
  await salvar(CNPJ_AURORA);
  await page.goto("/w/demo/b/pedidos/settings?aba=campos");
  await page.getByRole("button", { name: `Arquivar ${nome}` }).click();
  await expect(page.getByText("Campo arquivado")).toBeVisible();
});
