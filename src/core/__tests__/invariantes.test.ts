// Invariante 1: nenhum código fora de src/core escreve em cards/card_links.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..", "..");
const PERMITIDOS = [join("src", "core") + sep, join("src", "db") + sep];

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "node_modules" ? [] : arquivos(p);
    return /\.(ts|tsx|js|mjs)$/.test(n) ? [p] : [];
  });
}

const ESCRITA = [
  /\.(insert|update|delete)\(\s*(cards|cardLinks)\s*\)/, // drizzle
  /\b(insert\s+into|update|delete\s+from)\s+(cards|card_links)\b/i, // SQL cru
];

describe("invariante 1", () => {
  it("escrita em cards/card_links só em src/core", () => {
    const violacoes = arquivos(join(RAIZ, "src"))
      .map((p) => relative(RAIZ, p))
      .filter((p) => !PERMITIDOS.some((ok) => p.startsWith(ok)))
      .filter((p) => ESCRITA.some((re) => re.test(readFileSync(join(RAIZ, p), "utf8"))));
    expect(violacoes, "use as operações de src/core/cards.ts").toEqual([]);
  });
});
