// Regras do design (docs/DESIGN.md), parte do `pnpm lint`: nenhuma cor literal nem sombra em componentes.
// Cores só em src/styles/tokens.css; componentes usam var(--token) ou classes mapeadas para tokens.
//  - hex (#rgb, #rrggbb) em src/**/*.{ts,tsx}
//  - classes de sombra (shadow-*)
//  - cores da paleta do Tailwind (bg-red-500, text-white, bg-black/30…), que fogem dos tokens
// Testes ficam de fora (hex como dado, ex.: cor gravada pelo usuário).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = process.cwd();
const PALETA = "black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const REGRAS = [
  { nome: "cor hex fora de tokens.css", re: /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g },
  { nome: "sombra (use border border-line)", re: /\bshadow-(?:xs|sm|md|lg|xl|2xl|inner|none|\[)/g },
  { nome: "cor da paleta do Tailwind (use um token)", re: new RegExp(String.raw`\b(?:bg|text|border|ring|fill|stroke|outline|divide|from|to|via|decoration|caret|accent)-(?:${PALETA})(?:-\d{2,3})?(?:\/\d+)?(?![\w-])`, "g") },
];

// Autoteste: as regras pegam o que devem e deixam passar os tokens (um escape errado já as desligou uma vez).
const DEVE_PEGAR = ['color:"#fff"', "bg-[#3b5bff]", "shadow-xs", "hover:shadow-lg", "bg-black/30", "text-red-500", "text-white", "border-amber-300"];
const DEVE_PASSAR = ["bg-accent", "text-ink-2", "border-line", "bg-accent-soft", 'href="#detalhes"', "text-on-cor", "accent-[var(--accent)]"];
const pega = (s) => REGRAS.some((r) => new RegExp(r.re.source, r.re.flags.replace("g", "")).test(s));
const falhas = [...DEVE_PEGAR.filter((s) => !pega(s)).map((s) => `não pegou ${s}`), ...DEVE_PASSAR.filter(pega).map((s) => `pegou ${s}`)];
if (falhas.length) {
  console.error(`lint-design: autoteste falhou (${falhas.join("; ")})`);
  process.exit(2);
}

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "__tests__" || n === "node_modules" ? [] : arquivos(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

const erros = [];
for (const p of arquivos(join(RAIZ, "src"))) {
  const linhas = readFileSync(p, "utf8").split("\n");
  linhas.forEach((linha, i) => {
    for (const r of REGRAS) for (const m of linha.matchAll(r.re)) erros.push(`${relative(RAIZ, p)}:${i + 1}: ${r.nome}: ${m[0]}`);
  });
}
if (erros.length) {
  console.error(`Design (docs/DESIGN.md): ${erros.length} problema(s)\n${erros.join("\n")}`);
  process.exit(1);
}
console.log("✔ Design: sem cores literais, sombras ou paleta fora dos tokens");
