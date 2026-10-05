// Criação de cards: campos condicionais avaliados ao vivo no modal e sub-tabela que abre o formulário
// completo do board filho quando o "Adicionar" rápido não cobre os obrigatórios (seed "demo").
import { expect, test, type Page } from "@playwright/test";
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

test("modal de criação: campo condicional aparece e passa a ser obrigatório conforme o preenchimento", async ({ page }) => {
  await entrar(page);
  await page.goto("/w/demo/b/pedidos");
  await page.getByRole("button", { name: "Novo cartão", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Novo cartão" });

  const janela = modal.locator('[data-campo-novo="Janela de entrega"]');
  await expect(janela).toHaveCount(0);
  await modal.getByLabel("Referência").fill("Pedido expresso (e2e)");
  await modal.getByLabel("Entrega expressa").check();
  await expect(janela).toBeVisible();
  await expect(janela.getByText("*")).toBeVisible();

  await modal.getByRole("button", { name: "Criar cartão" }).click();
  await expect(janela.getByText("Obrigatório nesta fase")).toBeVisible();

  // Desmarcar esconde de novo; marcar e preencher cria
  await modal.getByLabel("Entrega expressa").uncheck();
  await expect(janela).toHaveCount(0);
  await modal.getByLabel("Entrega expressa").check();
  await modal.getByLabel("Janela de entrega").fill("Manhã, das 8h às 12h");
  await anexarComprovante(modal);
  await modal.getByRole("button", { name: "Criar cartão" }).click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("painel-card").locator('[data-campo="Janela de entrega"]')).toBeVisible();
});

test("sub-tabela: sem cobertura dos obrigatórios, Adicionar abre o formulário completo já vinculado ao pai", async ({ page }) => {
  await entrar(page);
  await page.goto("/w/demo/b/pedidos");
  await page.getByRole("button", { name: "Novo cartão", exact: true }).click();
  const novo = page.getByRole("dialog", { name: "Novo cartão" });
  await novo.getByLabel("Referência").fill("Pedido com entrega (e2e)");
  await anexarComprovante(novo);
  await novo.getByRole("button", { name: "Criar cartão" }).click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);

  const painel = page.getByTestId("painel-card");

  // Itens: o formulário rápido cobre os obrigatórios, então continua inline
  await expect(painel.locator('[data-subtabela="Itens"]').getByLabel("Valor", { exact: true })).toBeVisible();

  // Entregas: Instruções (texto longo, obrigatório) não cabe no rápido, então Adicionar abre o modal
  const entregas = painel.locator('[data-subtabela="Entregas"]');
  await expect(entregas.getByLabel("Valor", { exact: true })).toHaveCount(0);
  await entregas.getByRole("button", { name: "Adicionar em Entregas" }).click();
  const modal = page.getByRole("dialog", { name: "Novo item em Entregas" });
  await expect(modal).toBeVisible();
  await modal.getByLabel("Valor").fill("1200");
  await modal.getByRole("button", { name: "Criar cartão" }).click();
  await expect(modal.locator('[data-campo-novo="Instruções"]').getByText("Obrigatório nesta fase")).toBeVisible();
  await modal.getByLabel("Instruções").fill("Deixar na recepção, com o porteiro.");
  await modal.getByRole("button", { name: "Criar cartão" }).click();
  await expect(modal).toBeHidden();
  await expect(entregas.locator("[data-linha]")).toHaveCount(1);
  await expect(entregas.locator("[data-linha]")).toContainText("1.200,00");
});

test("modal de criação: relação N:1 com busca; obrigatório faltando é destacado e recebe foco", async ({ page }) => {
  await entrar(page);
  await page.goto("/w/demo/b/pedidos");
  await page.getByRole("button", { name: "Novo cartão", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Novo cartão" });

  // Relação N:1 (um card) aparece no formulário; 1:N (Itens, Entregas) fica para depois de criar
  const cliente = modal.locator('[data-campo-novo="Cliente"]');
  await expect(cliente).toBeVisible();
  await expect(modal.locator('[data-campo-novo="Itens"]')).toHaveCount(0);
  await cliente.getByLabel("Cliente").fill("Padaria");
  await cliente.getByRole("option", { name: /Padaria Central/ }).getByRole("button").click();
  await expect(cliente.locator('[data-escolhido="Padaria Central"]')).toBeVisible();
  await expect(cliente.getByLabel("Cliente")).toHaveCount(0); // um só card

  // Obrigatório vazio: mensagem, destaque e foco no primeiro campo faltante
  await modal.getByRole("button", { name: "Criar cartão" }).click();
  const referencia = modal.locator('[data-campo-novo="Referência"]');
  await expect(referencia).toHaveAttribute("data-destaque", "true");
  await expect(referencia.getByRole("textbox")).toBeFocused();
  await expect(modal.getByRole("alert").filter({ hasText: "Preencha os campos obrigatórios." })).toBeVisible();

  await referencia.getByRole("textbox").fill("Pedido com cliente (e2e)");
  await anexarComprovante(modal);
  await modal.getByRole("button", { name: "Criar cartão" }).click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("coluna-atual").locator('[data-campo="Cliente"]').getByRole("link", { name: "Padaria Central" })).toBeVisible();
});

test("formato (regex): erro abaixo do campo com a mensagem configurada, ajuda sempre visível", async ({ page }) => {
  await entrar(page);
  const configurar = async (regex: string, mensagem: string, ajuda: string) => {
    await page.goto("/w/demo/b/pedidos/settings?aba=campos");
    await page.getByRole("button", { name: "Editar Contato" }).click();
    const m = page.getByRole("dialog", { name: /Editar campo/ });
    await m.getByLabel("Texto de ajuda").fill(ajuda);
    await m.getByText("Avançado").click();
    await m.getByLabel("Formato (regex)").fill(regex);
    await m.getByLabel("Mensagem de formato").fill(mensagem);
    await m.getByRole("button", { name: "Salvar campo" }).click();
    await expect(m).toBeHidden();
  };
  await configurar("^[A-Z]+$", "Use só letras maiúsculas, sem espaços.", "Nome curto do contato.");
  try {
    await page.goto("/w/demo/b/pedidos");
    await page.getByRole("button", { name: "Novo cartão", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Novo cartão" });
    const contato = modal.locator('[data-campo-novo="Contato"]');
    await modal.getByLabel("Referência").fill("Pedido com formato (e2e)");
    await contato.getByRole("textbox").fill("ACME LTDA");
    await anexarComprovante(modal);
    await modal.getByRole("button", { name: "Criar cartão" }).click();
    await expect(contato.locator("[data-erro-campo]")).toHaveText("Use só letras maiúsculas, sem espaços.");
    await expect(contato.getByText("Nome curto do contato.")).toBeVisible();
    await expect(contato).toHaveAttribute("data-destaque", "true");
    await expect(contato.getByRole("textbox")).toBeFocused();
    await contato.getByRole("textbox").fill("ACME");
    await modal.getByRole("button", { name: "Criar cartão" }).click();
    await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);
  } finally {
    await configurar("", "", "");
  }
});
