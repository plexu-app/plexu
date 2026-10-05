// Anexos (seed "demo"): contrato com minuta obrigatória — upload antes de criar, vários arquivos,
// tipo recusado, remover, download com o nome original e anexo novo pelo formulário da fase.
import { expect, test } from "@playwright/test";
import { PDF } from "./apoio";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";

test("contrato com anexo obrigatório: upload, remover, criar, baixar e anexar pela fase", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);

  await page.goto("/w/demo/b/contratos");
  await page.getByRole("button", { name: "Novo card", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Novo card" });
  await modal.getByLabel("Objeto").fill("Contrato com anexo (e2e)");
  const minuta = modal.locator('[data-campo-novo="Minuta do contrato"]');
  const arquivo = minuta.locator('input[type="file"]');

  // Obrigatório: sem arquivo, não cria
  await modal.getByRole("button", { name: "Criar card" }).click();
  await expect(minuta.locator("[data-erro-campo]")).toHaveText("Obrigatório nesta fase");
  await expect(minuta.getByText("PDF ou Word da minuta.")).toBeVisible();

  // Tipo não aceito é recusado antes do envio
  await arquivo.setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from("png") });
  await expect(minuta.getByRole("alert").filter({ hasText: "Tipo não aceito" })).toBeVisible();

  // Vários arquivos; remover um
  await arquivo.setInputFiles([
    { name: "Minuta versão 1.pdf", mimeType: "application/pdf", buffer: PDF },
    { name: "rascunho.pdf", mimeType: "application/pdf", buffer: PDF },
  ]);
  await expect(minuta.locator("[data-anexo]")).toHaveCount(2);
  await minuta.getByRole("button", { name: "Remover rascunho.pdf" }).click();
  await expect(minuta.locator("[data-anexo]")).toHaveCount(1);

  await modal.getByRole("button", { name: "Criar card" }).click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);

  // No card: o anexo aparece e baixa com o nome original
  const noCard = page.getByTestId("coluna-atual").locator('[data-campo-anexos="Minuta do contrato"]');
  const link = noCard.getByRole("link", { name: "Minuta versão 1.pdf", exact: true });
  await expect(link).toBeVisible();
  const resp = await page.request.get((await link.getAttribute("href"))!);
  expect(resp.status()).toBe(200);
  expect(resp.headers()["content-type"]).toBe("application/pdf");
  expect(resp.headers()["content-disposition"]).toContain(`filename*=UTF-8''${encodeURIComponent("Minuta versão 1.pdf")}`);
  expect((await resp.body()).toString()).toBe(PDF.toString());

  // Anexar mais um pelo formulário da fase e salvar
  await noCard.locator('input[type="file"]').setInputFiles({ name: "anexo-assinado.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(noCard.locator('[data-anexo="anexo-assinado.pdf"]')).toBeVisible();
  // Salvamento automático do campo de anexo
  await expect(page.getByTestId("coluna-atual").locator('[data-campo="Minuta do contrato"]')).toHaveAttribute("data-salvamento", "salvo");
  await page.reload();
  await expect(page.getByTestId("coluna-atual").locator('[data-campo-anexos="Minuta do contrato"] [data-anexo]')).toHaveCount(2);

  // Sem sessão, o download é negado
  const anonimo = await page.context().browser()!.newContext();
  const semSessao = await anonimo.request.get(new URL((await link.getAttribute("href"))!, page.url()).toString());
  expect(semSessao.status()).toBe(401);
  await anonimo.close();
});
