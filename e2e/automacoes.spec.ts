// Automações e ações pela UI (seed "demo"), com o worker rodando (segundo webServer do Playwright):
// criar e publicar uma automação, testar com um card (simulação), ver o efeito ao criar um card, ver a
// execução e reexecutar; criar uma ação com mini-form e executá-la no card. Arquiva tudo no fim.
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { anexarComprovante } from "./apoio";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";
const URL_BANCO = process.env.E2E_DATABASE_URL ?? "postgres://plexu:plexu@localhost:5433/plexu_e2e";

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);
}

test("automação criada pela UI dispara ao criar card; teste com card; execuções; ação com mini-form", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  page.on("dialog", (d) => d.accept()); // confirmações de arquivar
  await entrar(page);
  const sufixo = Date.now().toString(36);
  const nomeAuto = `Comentar ao criar ${sufixo}`;
  const nomeAcao = `Registrar revisão ${sufixo}`;
  const objeto = `Pedido automação ${sufixo}`;
  try {
    await fluxo(page, { sufixo, nomeAuto, nomeAcao, objeto });
  } finally {
    // Mesmo se falhar: nada desta execução fica ativo no banco do e2e.
    const sql = postgres(URL_BANCO, { max: 1, onnotice: () => {} });
    await sql`update automations set archived_at = now() where name = ${nomeAuto} and archived_at is null`;
    await sql`update actions set archived_at = now() where name = ${nomeAcao} and archived_at is null`;
    await sql.end();
  }
});

async function fluxo(page: Page, { sufixo, nomeAuto, nomeAcao, objeto }: { sufixo: string; nomeAuto: string; nomeAcao: string; objeto: string }) {

  // 1. Nova automação: card criado → comentário com a referência, publicada
  await page.goto("/w/demo/b/pedidos/settings?aba=automacoes");
  await page.getByRole("button", { name: "Nova automação" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Nome da automação").fill(nomeAuto);
  await editor.getByLabel("Ambiente").selectOption({ label: "Publicada" });
  await expect(editor.getByLabel("Gatilho")).toHaveValue("card_created");
  await editor.getByLabel("Adicionar passo").selectOption({ label: "Comentar no card" });
  await editor.getByLabel("Comentário (passo 1)").fill(`Automação ${sufixo}: {{ card.referencia }}`);
  // Alvo do passo: com "filhos via Itens", os campos oferecidos são os do board dos itens
  await editor.getByLabel("Adicionar passo").selectOption({ label: "Preencher campo" });
  await expect(editor.getByLabel("Card alvo (passo 2)")).toHaveValue("self");
  await expect(editor.getByLabel("Campo (passo 2)").locator("option", { hasText: "Referência" })).toHaveCount(1);
  await editor.getByLabel("Card alvo (passo 2)").selectOption({ label: "Filhos via Itens (Itens)" });
  await expect(editor.getByLabel("Campo (passo 2)").locator("option", { hasText: "Referência" })).toHaveCount(0);
  await expect(editor.getByLabel("Campo (passo 2)").locator("option", { hasText: "Valor" })).toHaveCount(1);
  await editor.getByRole("button", { name: "Remover passo 2" }).click();
  await editor.getByRole("button", { name: "Salvar automação" }).click();
  await expect(page.getByText("Automação criada")).toBeVisible();
  const linha = page.locator(`[data-automacao="${nomeAuto}"]`);
  await expect(linha.locator("[data-ambiente]")).toHaveText("Publicada");
  await expect(linha.locator("[data-ultima-execucao]")).toHaveText("nunca rodou");

  // 2. Testar com um card existente: simulação, nada gravado
  await linha.getByRole("button", { name: `Testar ${nomeAuto}` }).click();
  const teste = page.getByRole("dialog");
  await teste.getByLabel("Buscar card para testar").click(); // lista os cards do board
  await teste.getByRole("option").first().click();
  await expect(teste.locator("[data-card-teste]")).toBeVisible();
  await teste.getByRole("button", { name: "Rodar teste" }).click();
  const resultado = teste.locator("[data-resultado-teste]");
  await expect(resultado.locator('[data-status="success"]')).toBeVisible();
  await expect(resultado.locator('[data-item-log="add_comment"]')).toContainText("ok");
  await expect(resultado.locator('[data-item-log="simulacao"]')).toContainText("alterações desfeitas");
  await page.keyboard.press("Escape");

  // 3. Criar um card: o worker despacha o evento e a automação comenta
  await page.goto("/w/demo/b/pedidos");
  await page.getByRole("button", { name: "Novo cartão", exact: true }).click();
  const novo = page.getByRole("dialog", { name: "Novo cartão" });
  await novo.getByLabel("Referência").fill(objeto);
  await novo.getByLabel("Contato").fill("Compras Automação");
  await anexarComprovante(novo);
  await novo.getByRole("button", { name: "Criar cartão" }).click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);
  const urlCard = page.url();
  await expect(async () => {
    await page.reload();
    await page.getByRole("tab", { name: /Comentários/ }).click();
    await expect(page.getByText(`Automação ${sufixo}: ${objeto}`)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60_000 });

  // 4. Execuções: a do card aparece com sucesso; reexecutar
  await page.goto("/w/demo/b/pedidos/settings?aba=execucoes");
  await page.getByLabel("Filtrar por automação ou ação").selectOption({ label: nomeAuto });
  const doCard = page.locator("tr[data-execucao]").filter({ has: page.locator(`a[href$="/c/${urlCard.split("/c/")[1]}"]`) });
  const execucao = doCard;
  await expect(execucao).toHaveCount(1);
  await expect(execucao.locator('[data-status="success"]')).toBeVisible();
  await execucao.locator("td").first().click(); // abre o log (o centro da linha é o link do card)
  await expect(page.locator('[data-item-log="add_comment"]').first()).toContainText("ok");
  await execucao.getByRole("button", { name: "Reexecutar" }).click();
  await expect(page.getByText("Reexecutada: sucesso")).toBeVisible();
  await expect(doCard).toHaveCount(2);

  // 5. Ação com mini-form: botão no card
  await page.goto("/w/demo/b/pedidos/settings?aba=acoes");
  await page.getByRole("button", { name: "Nova ação" }).click();
  const editorAcao = page.getByRole("dialog");
  await editorAcao.getByLabel("Nome da ação").fill(nomeAcao);
  await editorAcao.getByRole("button", { name: "Campo do formulário" }).click();
  await editorAcao.getByLabel("Rótulo do campo 1").fill("Nota da revisão");
  await editorAcao.getByLabel("Identificador do campo 1").fill("nota");
  await editorAcao.locator('[data-campo-form="1"]').getByLabel("obrigatório").check();
  await editorAcao.getByLabel("Adicionar passo").selectOption({ label: "Comentar no card" });
  await editorAcao.getByLabel("Comentário (passo 1)").fill("Revisão: {{ form.nota }}");
  await editorAcao.getByRole("button", { name: "Salvar ação" }).click();
  await expect(page.getByText("Ação criada")).toBeVisible();

  await page.goto(urlCard);
  await page.locator("[data-acoes-card]").getByRole("button", { name: nomeAcao }).click();
  const form = page.getByRole("dialog", { name: nomeAcao });
  await form.getByLabel(/Nota da revisão/).fill("tudo certo");
  await form.getByRole("button", { name: "Executar" }).click();
  await expect(page.getByText(`${nomeAcao}: feito`)).toBeVisible();
  await page.getByRole("tab", { name: /Comentários/ }).click();
  await expect(page.getByText("Revisão: tudo certo")).toBeVisible();

  // Limpeza: arquiva a automação e a ação
  await page.goto("/w/demo/b/pedidos/settings?aba=automacoes");
  await page.locator(`[data-automacao="${nomeAuto}"]`).getByRole("button", { name: `Arquivar ${nomeAuto}` }).click();
  await expect(page.getByText("Automação arquivada")).toBeVisible();
  await page.goto("/w/demo/b/pedidos/settings?aba=acoes");
  await page.locator(`[data-acao-config="${nomeAcao}"]`).getByRole("button", { name: `Arquivar ${nomeAcao}` }).click();
  await expect(page.getByText("Ação arquivada")).toBeVisible();
}
