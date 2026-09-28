// Apoio aos e2e: anexar um PDF à "Minuta do contrato" (anexo obrigatório na criação de contratos).
import { expect, type Locator } from "@playwright/test";

export const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

export async function anexarMinuta(modal: Locator, nome = "minuta.pdf") {
  const campo = modal.locator('[data-campo-anexos="Minuta do contrato"]');
  await campo.locator('input[type="file"]').setInputFiles({ name: nome, mimeType: "application/pdf", buffer: PDF });
  await expect(campo.locator(`[data-anexo="${nome}"]`)).toBeVisible();
}
