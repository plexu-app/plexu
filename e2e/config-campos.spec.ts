// Settings → Campos agrupados pela fase de origem: coluna "Fase", chips e arrastar entre grupos.
// Independente de estado: cada teste cria o próprio board (fases e campos) no banco do e2e e o apaga no
// fim (afterEach), passe ou falhe. Não toca nos boards do seed.
import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";
const URL_BANCO = process.env.E2E_DATABASE_URL ?? "postgres://plexu:plexu@localhost:5433/plexu_e2e";

const acaoConcluida = (page: Page, timeout = 10_000) =>
  page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"], { timeout });

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

/** Board próprio: fases Elaboração → Vigente → Encerrado; CNPJ a partir de Elaboração, Valor pago a partir de Vigente, Observação em todas. */
async function criarBoard(sql: postgres.Sql, sufixo: string) {
  const [ws] = await sql`select id from workspaces where slug = 'demo'`;
  const slug = `config-e2e-${sufixo}`;
  const [b] = await sql`insert into boards (workspace_id, slug, name, kind) values (${ws.id}, ${slug}, ${`Config e2e ${sufixo}`}, 'workflow') returning id`;
  const fases: Record<string, string> = {};
  for (const [i, nome] of ["Elaboração", "Vigente", "Encerrado"].entries()) {
    const [f] = await sql`insert into phases (board_id, name, position, is_terminal) values (${b.id}, ${nome}, ${i}, ${i === 2}) returning id`;
    fases[nome] = f.id;
  }
  const campo = (slugCampo: string, nome: string, tipo: string, pos: number, config: Record<string, unknown>) =>
    sql`insert into fields (board_id, slug, name, type, position, config) values (${b.id}, ${slugCampo}, ${nome}, ${tipo}, ${pos}, ${sql.json(config as never)}) returning id`;
  const [titulo] = await campo("titulo", "Título", "text", 0, {});
  await sql`update boards set title_field_id = ${titulo.id} where id = ${b.id}`;
  await campo("cnpj", "CNPJ", "cnpj", 1, { fill_phases: [fases["Elaboração"]] });
  await campo("valor_pago", "Valor pago", "currency", 2, { fill_phases: [fases.Vigente] });
  await campo("observacao", "Observação", "long_text", 3, {});
  return { id: b.id as string, slug };
}

let sql: postgres.Sql;
let board: { id: string; slug: string } | null = null;

test.beforeEach(async () => {
  sql = postgres(URL_BANCO, { max: 1, onnotice: () => {} });
  board = await criarBoard(sql, Date.now().toString(36));
});

test.afterEach(async () => {
  // Sem cards: apagar o board leva fases, campos e ajustes por fase (cascata).
  if (board) await sql`delete from boards where id = ${board.id}`;
  board = null;
  await sql.end();
});

test("campos agrupados pela primeira fase: chips de fases, arrastar entre grupos e modal", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);
  await page.goto(`/w/demo/b/${board!.slug}/settings?aba=campos`);

  const grupo = (titulo: string) => page.locator(`[data-grupo-fase="${titulo}"]`);
  const cnpj = (titulo: string) => grupo(titulo).locator('[data-config-campo="cnpj"]');
  const chips = page.locator('[data-preenchido-em="CNPJ"] [data-chip-fase]');
  await expect(cnpj("A partir de Elaboração")).toBeVisible();
  await expect(grupo("A partir de Vigente").locator('[data-config-campo="valor_pago"]')).toBeVisible();
  await expect(grupo("Em todas as fases").locator('[data-config-campo="observacao"]')).toBeVisible();
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
  await opcoes.getByLabel("Elaboração").click(); // a linha muda de grupo (remonta): click, não uncheck
  await salvou;
  await page.reload();
  await expect(cnpj("A partir de Vigente")).toBeVisible();
  await expect(chips).toHaveText(["Vigente"]);

  // Arrastar para "Em todas as fases" (repete se o soltar não pegou: sem esperar o timeout do teste)
  await expect(async () => {
    if (!(await cnpj("Em todas as fases").count())) await arrastar(page, page.getByRole("button", { name: "Arrastar CNPJ" }), grupo("Em todas as fases"));
    await expect(cnpj("Em todas as fases")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60_000 });
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
