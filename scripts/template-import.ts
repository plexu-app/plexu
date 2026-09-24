// Importa um template do Plexu (docs/TEMPLATE.md) num workspace: boards, fases, campos e regras.
//   pnpm template:import <arquivo.json> [--workspace "Nome"] [--membro email@exemplo]
// O workspace é criado se não existir (padrão: nome do template). --membro adiciona um usuário
// existente como owner. Usa DATABASE_URL (padrão: banco do demo, plexu).
import { readFileSync } from "node:fs";
import { ErroImportacao, importarTemplate } from "../src/db/template";
import { resumoTemplate, type Template } from "../src/lib/template";

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
  const arquivo = args.find((a, i) => !a.startsWith("--") && !["--workspace", "--membro"].includes(args[i - 1] ?? ""));
  if (!arquivo) throw new Error('uso: pnpm template:import <arquivo.json> [--workspace "Nome"] [--membro email]');
  const t = JSON.parse(readFileSync(arquivo, "utf8")) as Template;
  const r = await importarTemplate(t, { workspace: opcao(args, "--workspace") ?? t.name, membro: opcao(args, "--membro") });
  console.log(`workspace ${r.workspace.slug} (${r.workspace.criado ? "criado" : "existente"})`);
  for (const b of resumoTemplate(t)) {
    const slug = r.boards.find((x) => x.key === b.board)?.slug;
    console.log(`  ${slug}: ${b.fases} fases, ${b.campos} campos, ${b.regras} regras, ${b.automacoesPendentes} automações pendentes (não importadas)`);
  }
  console.log(`abrir: /w/${r.workspace.slug}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof ErroImportacao ? `template inválido:\n${e.message}` : e instanceof Error ? e.message : e);
    process.exit(1);
  });
