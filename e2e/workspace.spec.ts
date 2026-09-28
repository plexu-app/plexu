// Arquivar, restaurar e excluir workspace pela zona de perigo (seed "demo"). Não há UI para criar
// workspace: o teste cria um descartável direto no banco do e2e (plexu_e2e) com o usuário demo como owner.
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

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

test("zona de perigo: arquivar some das listas, restaurar volta, excluir confirma pelo nome e preserva eventos", async ({ page }) => {
  test.setTimeout(240_000);
  const sql = postgres(URL_BANCO, { max: 1, onnotice: () => {} });
  const sufixo = Date.now().toString(36);
  const nome = `Descartável ${sufixo}`;
  const slug = `descartavel-${sufixo}`;
  try {
    const [ws] = await sql`insert into workspaces (slug, name) values (${slug}, ${nome}) returning id`;
    await sql`insert into workspace_members (workspace_id, user_id, org_role) select ${ws.id}, id, 'owner' from users where email = ${EMAIL}`;

    await entrar(page);
    const lista = page.locator("[data-lista-workspaces]");
    await expect(lista.getByRole("link", { name: nome })).toBeVisible();

    // Um board, para ter o que apagar (e eventos de configuração)
    await page.goto(`/w/${slug}`);
    await page.getByRole("button", { name: "Novo board" }).first().click();
    const novo = page.getByRole("dialog", { name: "Novo board" });
    await novo.getByLabel("Nome").fill("Itens");
    await novo.getByRole("button", { name: "Criar board" }).click();
    await page.waitForURL(new RegExp(`/w/${slug}/b/itens`));

    // Arquivar: some da sidebar; a URL dá 404; aparece em Arquivados
    await lista.getByRole("link", { name: "Configurações do workspace" }).click();
    await page.waitForURL(new RegExp(`/w/${slug}/settings$`));
    const perigo = page.getByRole("region", { name: "Zona de perigo" });
    await perigo.getByRole("button", { name: "Arquivar" }).click();
    await page.waitForURL(/\/w\/demo$/);
    await expect(lista.getByRole("link", { name: nome })).toHaveCount(0);
    expect((await page.goto(`/w/${slug}/b/itens`))?.status()).toBe(404);
    await page.goto("/w/demo");
    await lista.getByRole("link", { name: /Arquivados \(\d+\)/ }).click();
    await page.waitForURL(/\/arquivados$/);
    const item = page.locator(`[data-arquivado="${nome}"]`);
    await expect(item).toBeVisible();

    // Restaurar: volta como estava
    await item.getByRole("button", { name: `Restaurar ${nome}` }).click();
    await page.waitForURL(new RegExp(`/w/${slug}$`));
    await expect(page.getByRole("link", { name: /Itens/ }).first()).toBeVisible();
    await expect(lista.getByRole("link", { name: nome })).toBeVisible();

    // Excluir: só com o nome exato
    await page.goto(`/w/${slug}/settings`);
    await perigo.getByRole("button", { name: "Excluir" }).click();
    const dialogo = page.getByRole("dialog", { name: `Excluir “${nome}”?` });
    const confirmar = dialogo.getByRole("button", { name: "Excluir definitivamente" });
    await expect(confirmar).toBeDisabled();
    await dialogo.getByLabel(/para confirmar/).fill("outro nome");
    await expect(confirmar).toBeDisabled();
    await dialogo.getByLabel(/para confirmar/).fill(nome);
    await confirmar.click();
    await page.waitForURL(/\/w\/demo$/);
    await expect(lista.getByRole("link", { name: nome })).toHaveCount(0);
    expect((await page.goto(`/w/${slug}/settings`))?.status()).toBe(404);

    // Banco: nada de boards; eventos ficam, todos marcados; lápide com deleted_at
    const [b] = await sql`select count(*)::int n from boards where workspace_id = ${ws.id}`;
    expect(b.n).toBe(0);
    const evs = await sql`select type, data, workspace_deleted_at from events where workspace_id = ${ws.id} order by occurred_at`;
    expect(evs.length).toBeGreaterThan(1);
    expect(evs.every((e) => e.workspace_deleted_at !== null)).toBe(true);
    expect(evs.some((e) => e.data.entidade === "workspace" && e.data.acao === "deleted")).toBe(true);
    const [lapide] = await sql`select deleted_at, slug from workspaces where id = ${ws.id}`;
    expect(lapide.deleted_at).not.toBeNull();
    expect(lapide.slug).not.toBe(slug);
  } finally {
    await sql.end();
  }
});
