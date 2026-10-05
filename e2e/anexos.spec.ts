// Anexos (seed "demo"): pedido com comprovante obrigatório — upload antes de criar, vários arquivos,
// tipo recusado, remover, download com o nome original e anexo novo pelo formulário da fase.
import { expect, test } from "@playwright/test";
import { PDF } from "./apoio";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";

test("pedido com anexo obrigatório: upload, remover, criar, baixar e anexar pela fase", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/w\/demo$/);

  await page.goto("/w/demo/b/pedidos");
  await page.getByRole("button", { name: "Novo cartão", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Novo cartão" });
  await modal.getByLabel("Referência").fill("Pedido com anexo (e2e)");
  const comprovante = modal.locator('[data-campo-novo="Comprovante do pedido"]');
  const arquivo = comprovante.locator('input[type="file"]');

  // Obrigatório: sem arquivo, não cria
  await modal.getByRole("button", { name: "Criar cartão" }).click();
  await expect(comprovante.locator("[data-erro-campo]")).toHaveText("Obrigatório nesta fase");
  await expect(comprovante.getByText("PDF ou Word do pedido.")).toBeVisible();

  // Tipo não aceito é recusado antes do envio
  await arquivo.setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from("png") });
  await expect(comprovante.getByRole("alert").filter({ hasText: "Tipo não aceito" })).toBeVisible();

  // Vários arquivos; remover um
  await arquivo.setInputFiles([
    { name: "Comprovante versão 1.pdf", mimeType: "application/pdf", buffer: PDF },
    { name: "rascunho.pdf", mimeType: "application/pdf", buffer: PDF },
  ]);
  await expect(comprovante.locator("[data-anexo]")).toHaveCount(2);
  await comprovante.getByRole("button", { name: "Remover rascunho.pdf" }).click();
  await expect(comprovante.locator("[data-anexo]")).toHaveCount(1);

  await modal.getByRole("button", { name: "Criar cartão" }).click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);

  // No card: o anexo aparece e baixa com o nome original
  const noCard = page.getByTestId("coluna-atual").locator('[data-campo-anexos="Comprovante do pedido"]');
  const link = noCard.getByRole("link", { name: "Comprovante versão 1.pdf", exact: true });
  await expect(link).toBeVisible();
  const resp = await page.request.get((await link.getAttribute("href"))!);
  expect(resp.status()).toBe(200);
  expect(resp.headers()["content-type"]).toBe("application/pdf");
  expect(resp.headers()["content-disposition"]).toContain(`filename*=UTF-8''${encodeURIComponent("Comprovante versão 1.pdf")}`);
  expect((await resp.body()).toString()).toBe(PDF.toString());

  // Anexar mais um pelo formulário da fase e salvar
  await noCard.locator('input[type="file"]').setInputFiles({ name: "anexo-assinado.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(noCard.locator('[data-anexo="anexo-assinado.pdf"]')).toBeVisible();
  // Salvamento automático do campo de anexo
  await expect(page.getByTestId("coluna-atual").locator('[data-campo="Comprovante do pedido"]')).toHaveAttribute("data-salvamento", "salvo");
  await page.reload();
  await expect(page.getByTestId("coluna-atual").locator('[data-campo-anexos="Comprovante do pedido"] [data-anexo]')).toHaveCount(2);

  // Sem sessão, o download é negado
  const anonimo = await page.context().browser()!.newContext();
  const semSessao = await anonimo.request.get(new URL((await link.getAttribute("href"))!, page.url()).toString());
  expect(semSessao.status()).toBe(401);
  await anonimo.close();
});
