// Exporta boards de um workspace como template do Plexu (docs/TEMPLATE.md). Só configuração.
//   pnpm template:export <board> [<board>...] [--workspace slug] [--saida arquivo.json]
// Padrão: workspace "demo" e saída no terminal. Exporte juntos os boards ligados por relações/rollups.
import { writeFileSync } from "node:fs";
import { exportarTemplate } from "../src/db/template";

function opcao(args: string[], nome: string) {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  try {
    process.loadEnvFile?.();
  } catch {
    // sem .env
  }
  const args = process.argv.slice(2);
  const boardsArg = args.filter((a, i) => !a.startsWith("--") && !["--workspace", "--saida"].includes(args[i - 1] ?? ""));
  if (!boardsArg.length) throw new Error("uso: pnpm template:export <board> [<board>...] [--workspace slug] [--saida arquivo.json]");
  const t = await exportarTemplate(opcao(args, "--workspace") ?? "demo", boardsArg);
  const json = JSON.stringify(t, null, 2);
  const saida = opcao(args, "--saida");
  if (saida) {
    writeFileSync(saida, json);
    console.error(`template com ${t.boards.length} board(s) → ${saida}`);
  } else console.log(json);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
