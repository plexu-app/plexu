// Anexos: regras puras usadas no navegador (checagem antes do envio) e no servidor (palavra final).
// config.accept do campo: lista separada por vírgula de extensões (".pdf") e tipos MIME ("image/*",
// "application/pdf"), como o atributo accept do HTML. Vazio = qualquer tipo.

export const LIMITE_PADRAO_MB = 25;

/** Normaliza config.accept: minúsculas, sem espaços, sem repetidos; extensões sempre com ponto. */
export function normalizarAccept(bruto: unknown): string {
  const lista = String(bruto ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .map((t) => (t.includes("/") || t.startsWith(".") ? t : `.${t}`));
  return [...new Set(lista)].join(",");
}

/** O arquivo (nome + MIME) é aceito pelo campo? */
export function aceita(nome: string, mime: string | null | undefined, accept: string | null | undefined): boolean {
  const regras = normalizarAccept(accept).split(",").filter(Boolean);
  if (!regras.length) return true;
  const ext = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")).toLowerCase() : "";
  const tipo = (mime ?? "").toLowerCase();
  return regras.some((r) => (r.startsWith(".") ? r === ext : r.endsWith("/*") ? tipo.startsWith(r.slice(0, -1)) : r === tipo));
}

/** Motivo de recusa do arquivo, ou null. limiteBytes: tamanho máximo por arquivo. */
export function problemaNoArquivo(arq: { name: string; type?: string; size: number }, accept: string | null | undefined, limiteBytes: number): string | null {
  if (arq.size <= 0) return `${arq.name}: arquivo vazio`;
  if (arq.size > limiteBytes) return `${arq.name}: maior que o limite de ${formatarTamanho(limiteBytes)}`;
  if (!aceita(arq.name, arq.type, accept)) return `${arq.name}: tipo não aceito neste campo (aceitos: ${normalizarAccept(accept).replace(/,/g, ", ")})`;
  return null;
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0).replace(".", ",")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Content-Disposition com o nome original (ASCII de reserva + filename* em UTF-8). */
export function contentDisposition(nome: string, tipo: "attachment" | "inline" = "attachment"): string {
  const ascii = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}
