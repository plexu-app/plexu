// Relatório de conversão Pipefy → Plexu em Markdown (a partir de converterPipefy().relatorio).
import type { DestinoAutomacao, Relatorio } from "./converter";

const esc = (s: string | null | undefined) => String(s ?? "—").replace(/\|/g, "\\|").replace(/\n/g, " ");

const ROTULO: Record<DestinoAutomacao, string> = {
  regra: "regra",
  rollup: "rollup",
  dynamic_text: "texto calculado",
  absorvida: "absorvida pelo modelo",
  pendente: "automação pendente",
};

export function relatorioMarkdown(r: Relatorio, titulo = "Relatório de conversão Pipefy → Plexu"): string {
  const t = r.totais;
  const convertidas = t.regras + t.rollups + t.textosCalculados;
  const soAtivas = r.boards.flatMap((b) => b.automacoes).filter((a) => a.ativa);
  const l: string[] = [`# ${titulo}`, ""];
  if (r.anonimizado) l.push("_Nomes anonimizados._", "");
  l.push(
    "## Resumo",
    "",
    `**${t.automacoes} automações no Pipefy (${t.ativas} ativas) → ${convertidas} regras/rollups/textos calculados + ${t.pendentes} automações pendentes no Plexu** (${t.absorvidas} deixam de existir porque o modelo já cobre).`,
    "",
    `Só as ativas: ${soAtivas.length} → ${soAtivas.filter((a) => a.destino !== "pendente").length} convertidas ou absorvidas.`,
    "",
    `Além disso, ${t.regrasConfig} regra(s) vêm da configuração do Pipefy (destinos permitidos por fase, filho obrigatório para finalizar), não de automações.`,
    "",
    "| Objeto | Campos (origem → Plexu) | Automações | Regras (de automação) | Regras (de configuração) | Rollups | Textos calc. | Pendentes | Condicionais convertidas |",
    "|---|---|---|---|---|---|---|---|---|",
  );
  for (const b of r.boards) {
    const plexu = b.campos.filter((c) => c.destino).length;
    l.push(
      `| ${esc(b.nome)} (${b.origem.tipo}) | ${b.campos.length} → ${new Set(b.campos.map((c) => c.destino).filter(Boolean)).size} (${plexu} linhas mapeadas) | ${b.automacoes.length} | ${b.regras} | ${b.regrasConfig} | ${b.rollups} | ${b.textosCalculados} | ${b.pendentes} | ${b.condicionais.convertidas}/${b.condicionais.total} |`,
    );
  }
  l.push("");

  for (const b of r.boards) {
    l.push(`## ${b.nome}`, "", `Origem: ${b.origem.tipo} ${r.anonimizado ? "" : b.origem.id} · board Plexu \`${b.board}\``, "");
    l.push("### Campos", "", "| Campo original | Tipo | Fase | Campo Plexu | Tipo Plexu | Nota |", "|---|---|---|---|---|---|");
    for (const c of b.campos) l.push(`| ${esc(c.origem)} | ${c.tipoOrigem} | ${esc(c.fase)} | ${esc(c.destino)} | ${esc(c.tipoDestino)} | ${esc(c.nota ?? "")} |`);
    l.push("");
    l.push("### Automações", "", "| Automação original | Ativa | Gatilho | Condição | Ação | Plexu | Ref | Nota |", "|---|---|---|---|---|---|---|---|");
    for (const a of b.automacoes)
      l.push(`| ${esc(a.origem)} | ${a.ativa ? "sim" : "não"} | ${esc(a.gatilho)} | ${esc(a.condicao)} | ${esc(a.acao)} | ${ROTULO[a.destino]} | ${esc(a.ref)} | ${esc(a.nota ?? "")} |`);
    if (!b.automacoes.length) l.push("| — | | | | | | | |");
    l.push("");
    l.push("### Conexões", "", "| Campo | Alvo | Plexu |", "|---|---|---|");
    for (const c of b.conexoes) l.push(`| ${esc(c.campo)} | ${esc(c.alvo)} | ${esc(c.destino)} |`);
    if (!b.conexoes.length) l.push("| — | | |");
    l.push("");
    l.push(`### Condicionais de campo`, "", `${b.condicionais.convertidas} de ${b.condicionais.total} viraram \`visible\` (expressão).`, "");
    for (const n of b.condicionais.naoConvertidas) l.push(`- Não convertida: ${esc(n)}`);
    if (b.condicionais.naoConvertidas.length) l.push("");
    l.push("### Não representado", "");
    for (const n of b.naoRepresentado) l.push(`- **${esc(n.item)}**: ${esc(n.motivo)}`);
    if (!b.naoRepresentado.length) l.push("- nada");
    l.push("");
  }
  l.push("## Não exportável via API", "");
  for (const n of r.naoExportavel) l.push(`- ${n}`);
  l.push("");
  return l.join("\n");
}
