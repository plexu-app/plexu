// Tema claro/escuro (docs/DESIGN.md): sem escolha segue o sistema; a escolha fica em localStorage e é
// aplicada por script no <head>, antes da pintura (o <body> já nasce com o tema certo, sem piscar).
import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";

type JanelaComTema = Window & { __temaAoCriarBody?: string };

/** Registra o data-theme do <html> no instante em que o <body> é criado, antes de qualquer conteúdo. */
async function vigiarTemaInicial(page: Page) {
  await page.addInitScript(() => {
    const obs = new MutationObserver(() => {
      if (!document.body) return;
      (window as JanelaComTema).__temaAoCriarBody = document.documentElement.dataset.theme ?? "";
      obs.disconnect();
    });
    obs.observe(document, { childList: true, subtree: true });
  });
}

const temaAoCriarBody = (page: Page) => page.evaluate(() => (window as JanelaComTema).__temaAoCriarBody);
const temaAtual = (page: Page) => page.locator("html").getAttribute("data-theme");
const fundo = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("sem escolha, o tema segue o sistema", async ({ page }) => {
  await vigiarTemaInicial(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  expect(await temaAoCriarBody(page)).toBe("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  expect(await temaAoCriarBody(page)).toBe("light");
});

test("alternar Claro/Escuro persiste depois de recarregar, sem piscar", async ({ page }) => {
  await vigiarTemaInicial(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);
  await page.goto("/w/demo/b/entregas");
  const tema = page.getByRole("complementary", { name: "Navegação" }).getByRole("group", { name: "Tema" });
  expect(await temaAtual(page)).toBe("light");
  const fundoClaro = await fundo(page);

  // Escolhe Escuro contra a preferência do sistema: vale na hora e depois de recarregar
  await tema.getByRole("button", { name: "Escuro" }).click();
  await expect(tema.getByRole("button", { name: "Escuro" })).toHaveAttribute("aria-pressed", "true");
  expect(await temaAtual(page)).toBe("dark");
  expect(await page.evaluate(() => localStorage.getItem("plexu-theme"))).toBe("dark");
  await page.reload();
  expect(await temaAoCriarBody(page)).toBe("dark");
  expect(await fundo(page)).not.toBe(fundoClaro);
  await expect(tema.getByRole("button", { name: "Escuro" })).toHaveAttribute("aria-pressed", "true");

  // Volta para Claro: idem
  await tema.getByRole("button", { name: "Claro" }).click();
  await page.reload();
  expect(await temaAoCriarBody(page)).toBe("light");
  expect(await fundo(page)).toBe(fundoClaro);
});
