// Colunas da sub-tabela (relation.table_fields) escolhidas no modal do campo e edição de data direto na
// tabela (seed "demo"). Restaura a configuração da relação no fim (afterEach), passe ou falhe.
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";
const URL_BANCO = process.env.E2E_DATABASE_URL ?? "postgres://plexu:plexu@localhost:5433/plexu_e2e";

/** Resposta da server action que grava a célula. */
const gravacao = (page: Page) => page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"], { timeout: 15_000 });

let sql: postgres.Sql;
let original: { id: string; config: unknown } | null = null;

test.beforeEach(async () => {
  sql = postgres(URL_BANCO, { max: 1, onnotice: () => {} });
  const [f] = await sql`select f.id, f.config from fields f join boards b on b.id = f.board_id join workspaces w on w.id = b.workspace_id
    where w.slug = 'demo' and b.slug = 'pedidos' and f.slug = 'itens'`;
  original = { id: f.id, config: f.config };
});

test.afterEach(async () => {
  if (original) await sql`update fields set config = ${sql.json(original.config as never)} where id = ${original.id}`;
  await sql.end();
});

test("sub-tabela: colunas escolhidas no modal; data editável direto na tabela", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);

  // Modal do campo Itens: só Separado em (editável) e Valor
  await page.goto("/w/demo/b/pedidos/settings?aba=campos");
  await page.getByRole("button", { name: "Editar Itens" }).click();
  const modal = page.getByRole("dialog", { name: /Editar campo/ });
  const colunas = modal.getByRole("group", { name: "Colunas na sub-tabela" });
  await colunas.locator('[data-coluna="Separado em"]').getByRole("checkbox").first().check();
  await colunas.getByLabel("Editar Separado em na tabela").check();
  await colunas.locator('[data-coluna="Valor"]').getByRole("checkbox").first().check();
  await expect(colunas.getByLabel("Editar Separado na tabela")).toBeDisabled(); // coluna não escolhida
  await modal.getByRole("button", { name: "Salvar campo" }).click();
  await expect(modal).toBeHidden();

  // Pedido do seed com 2 itens: colunas na ordem escolhida; "Separado em" editável na célula
  const [c] = await sql`select c.id from cards c join boards b on b.id = c.board_id where b.slug = 'pedidos' and c.props->>(select f.id::text from fields f where f.board_id = b.id and f.slug = 'referencia') = 'Estantes do depósito' limit 1`;
  await page.goto(`/w/demo/b/pedidos/c/${c.id}`);
  const tabela = page.getByTestId("coluna-atual").locator('[data-subtabela="Itens"]');
  await expect(tabela.locator("thead th")).toHaveText(["Card", "Separado em", "Valor", ""]);
  const celula = tabela.locator("[data-linha]").first().locator('[data-celula="Separado em"] input[type="date"]');
  const antes = await celula.inputValue();
  let salvou = gravacao(page);
  await celula.fill("2027-01-15");
  await salvou;
  await page.reload();
  await expect(tabela.locator("[data-linha]").first().locator('[data-celula="Separado em"] input[type="date"]')).toHaveValue("2027-01-15");
  await expect(tabela.locator("[data-linha]").first().locator('[data-celula="Valor"] input')).toHaveCount(0); // Valor sem edição

  // Volta o valor original pela própria tabela
  const de_novo = tabela.locator("[data-linha]").first().locator('[data-celula="Separado em"] input[type="date"]');
  salvou = gravacao(page);
  await de_novo.fill(antes);
  await salvou;
  await page.reload();
  await expect(tabela.locator("[data-linha]").first().locator('[data-celula="Separado em"] input[type="date"]')).toHaveValue(antes);
});
