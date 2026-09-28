import { describe, expect, it } from "vitest";
import { aceita, contentDisposition, formatarTamanho, normalizarAccept, problemaNoArquivo } from "../anexos";

describe("anexos (regras puras)", () => {
  it("normaliza accept e aceita por extensão ou MIME", () => {
    expect(normalizarAccept(" PDF, .Docx ,image/* ,.pdf")).toBe(".pdf,.docx,image/*");
    expect(aceita("Contrato.PDF", "application/pdf", ".pdf")).toBe(true);
    expect(aceita("foto.jpg", "image/jpeg", "image/*")).toBe(true);
    expect(aceita("planilha.xlsx", "application/vnd.ms-excel", ".pdf,.docx")).toBe(false);
    expect(aceita("qualquer.bin", null, "")).toBe(true);
  });

  it("problemas: vazio, acima do limite, tipo", () => {
    expect(problemaNoArquivo({ name: "a.pdf", size: 0 }, "", 10)).toMatch(/vazio/);
    expect(problemaNoArquivo({ name: "a.pdf", size: 11 }, "", 10)).toMatch(/limite/);
    expect(problemaNoArquivo({ name: "a.png", type: "image/png", size: 5 }, ".pdf", 10)).toMatch(/não aceito/);
    expect(problemaNoArquivo({ name: "a.pdf", size: 5 }, ".pdf", 10)).toBeNull();
  });

  it("tamanho e Content-Disposition com nome original", () => {
    expect(formatarTamanho(512)).toBe("512 B");
    expect(formatarTamanho(2.5 * 1024 * 1024)).toBe("2,5 MB");
    expect(contentDisposition('Relatório "final".pdf')).toBe(`attachment; filename="Relatorio _final_.pdf"; filename*=UTF-8''${encodeURIComponent('Relatório "final".pdf')}`);
  });
});
