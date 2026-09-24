// Converte exports de estrutura do Pipefy (pnpm pipefy:export) num template do Plexu + relatório.
//   pnpm pipefy:to-template <export.json> [<export.json>...] [--saida template.json]
//        [--relatorio relatorio.md] [--nome "Nome do template"] [--anonimizar]
// Converta juntos os pipes/databases conectados entre si: conexões para fora do conjunto não viram
// relação. --anonimizar troca nomes de pipes, fases, campos, opções e automações por genéricos.
// Padrão de saída: exports/pipefy/template.json e exports/pipefy/relatorio.md (fora do git).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { converterPipefy } from "../src/lib/pipefy/converter";
import type { PfExport } from "../src/lib/pipefy/export";
import { relatorioMarkdown } from "../src/lib/pipefy/relatorio";
import { validarTemplate } from "../src/lib/template";

const COM_VALOR = ["--saida", "--relatorio", "--nome"];

function main() {
  const args = process.argv.slice(2);
  const opcao = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const arquivos = args.filter((a, i) => !a.startsWith("--") && !COM_VALOR.includes(args[i - 1] ?? ""));
  if (!arquivos.length) throw new Error("uso: pnpm pipefy:to-template <export.json>... [--saida arq] [--relatorio arq] [--nome n] [--anonimizar]");
  const exports = arquivos.map((a) => JSON.parse(readFileSync(a, "utf8")) as PfExport);
  const { template, relatorio } = converterPipefy(exports, { nome: opcao("--nome"), anonimizar: args.includes("--anonimizar") });
  const erros = validarTemplate(template);
  const saida = opcao("--saida") ?? "exports/pipefy/template.json";
  const arqRel = opcao("--relatorio") ?? "exports/pipefy/relatorio.md";
  for (const f of [saida, arqRel]) mkdirSync(dirname(f), { recursive: true });
  writeFileSync(saida, JSON.stringify(template, null, 2));
  writeFileSync(arqRel, relatorioMarkdown(relatorio));
  const t = relatorio.totais;
  console.log(`template → ${saida}\nrelatório → ${arqRel}`);
  console.log(`${t.automacoes} automações → ${t.regras} regras + ${t.rollups} rollups + ${t.textosCalculados} textos calculados + ${t.lookups} lookups; ${t.absorvidas} absorvidas; ${t.pendentes} pendentes`);
  if (erros.length) {
    console.error(`atenção: o template gerado tem ${erros.length} problema(s) de validação:`);
    for (const e of erros.slice(0, 20)) console.error(`  ${e.onde}: ${e.mensagem}`);
    process.exitCode = 2;
  }
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
