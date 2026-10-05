// Apoio aos e2e: anexar um PDF ao "Comprovante do pedido" (anexo obrigatório na criação de pedidos).
import { expect, type Locator } from "@playwright/test";

export const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

export async function anexarComprovante(modal: Locator, nome = "comprovante.pdf") {
  const campo = modal.locator('[data-campo-anexos="Comprovante do pedido"]');
  await campo.locator('input[type="file"]').setInputFiles({ name: nome, mimeType: "application/pdf", buffer: PDF });
  await expect(campo.locator(`[data-anexo="${nome}"]`)).toBeVisible();
}
