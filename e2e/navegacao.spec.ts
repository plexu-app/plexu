// Sidebar recolhível: botão e atalho Ctrl+B, estado persistido entre recargas.
import { expect, test } from "@playwright/test";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";

test("sidebar recolhe pelo botão e pelo atalho, e lembra o estado", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);

  const nav = page.getByRole("complementary", { name: "Navegação" });
  const largura = async () => (await nav.boundingBox())!.width;
  expect(await largura()).toBeGreaterThan(200);

  await nav.getByRole("button", { name: "Recolher barra lateral" }).click();
  await expect.poll(largura).toBeLessThan(80);
  await expect(nav.getByRole("link", { name: "Contratos" })).toBeVisible(); // ícone com nome acessível

  await page.reload();
  expect(await largura()).toBeLessThan(80);

  await page.keyboard.press("Control+b");
  await expect.poll(largura).toBeGreaterThan(200);
  await expect(nav.getByRole("button", { name: "Recolher barra lateral" })).toHaveAttribute("aria-expanded", "true");
  await page.reload();
  expect(await largura()).toBeGreaterThan(200);
});
