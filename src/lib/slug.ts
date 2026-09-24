/** "Gestão de Contratos 2026" → "gestao-de-contratos-2026". */
export function slugify(texto: string, max = 48): string {
  const s = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return s || "item";
}

/** Primeiro slug livre: base, base-2, base-3... */
export function slugLivre(base: string, usados: Iterable<string>): string {
  const set = new Set(usados);
  if (!set.has(base)) return base;
  for (let i = 2; ; i++) if (!set.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** Slug de campo: identificador válido em CEL (letras, dígitos, _; não começa com dígito). */
export function slugCampo(texto: string): string {
  const s = slugify(texto, 40).replace(/-/g, "_");
  return /^[0-9]/.test(s) ? `c_${s}` : s;
}
