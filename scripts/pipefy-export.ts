// Exporta a ESTRUTURA de pipes/databases do Pipefy via GraphQL (https://api.pipefy.com/graphql):
// fases, campos (tipo, obrigatório, editável em outras fases, opções, conexões), start form,
// condicionais de campo, automações (gatilho, condição, ações) e webhooks (só nome e eventos).
// Nunca lê cards. Registros de database só com --registros, e só id e título: bases de apoio
// (categorias, grupos) cujos registros as condições de outro pipe comparam.
//
//   pnpm pipefy:export <id> [<id>...] [--saida exports/pipefy] [--registros]
//
// Token em PIPEFY_TOKEN (variável de ambiente ou .env). A saída (exports/) está no .gitignore:
// exports contêm dados de configuração do usuário e nunca devem ser versionados.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.pipefy.com/graphql";

// Campos de campo (PhaseField/TableField) comuns aos dois tipos.
const CAMPO = `
  id internal_id uuid label type required description help index options settings custom_validation
  is_multiple minimal_view canConnectMultiples canConnectExisting canCreateNewConnected
  childMustExistToFinishParent allChildrenMustBeDoneToFinishParent
  connectedRepo { __typename ... on PublicPipe { id name } ... on PublicTable { id name } }`;

const CONDICIONAL = `
  id name
  condition { id expressions_structure expressions { id structure_id field_address operation value } }
  actions { id actionId whenEvaluator phaseField { id label } phase { id name } }`;

const Q_PIPE = `query($id: ID!) { pipe(id: $id) {
  id uuid name description noun organizationId type
  title_field { id label }
  start_form_fields { ${CAMPO} editable synced_with_card }
  startFormFieldConditions { ${CONDICIONAL} }
  phases {
    id name description done index isDraft can_receive_card_directly_from_draft
    cards_can_be_moved_to_phases { id name }
    fields { ${CAMPO} editable synced_with_card allChildrenMustBeDoneToMoveParent }
    fieldConditions { ${CONDICIONAL} }
  }
  labels { id name }
  webhooks { id name actions }
} }`;

const Q_TABELA = `query($id: ID!) { table(id: $id) {
  id internal_id uuid name description noun
  title_field { id label }
  table_fields { ${CAMPO} unique }
  statuses { id name }
  labels { id name }
  webhooks { id name actions }
} }`;

// Registros de database (bases de apoio): só id e título, paginado.
const Q_REGISTROS = `query($id: ID!, $after: String) { table_records(table_id: $id, first: 50, after: $after) {
  pageInfo { hasNextPage endCursor }
  edges { node { id title } }
} }`;
const LIMITE_REGISTROS = 2000;

// Automações: sem segredos (cabeçalhos, chaves, OAuth e corpo HTTP ficam de fora; da URL, só o host).
const Q_AUTOMACOES = `query($org: ID!, $repo: ID, $after: String) { automations(organizationId: $org, repoId: $repo, first: 50, after: $after) {
  pageInfo { hasNextPage endCursor }
  nodes {
    id name active action_id event_id scheduler_frequency
    schedulerCron { minute hour dayOfMonth month dayOfWeek }
    event_repo { id name }
    event_params { fromPhaseId inPhaseId to_phase_id kindOfSla triggerAutomationId triggerFieldIds triggerFields { id label } }
    condition { id expressions_structure expressions { id structure_id field_address operation value } }
    searchFor { id field operation value }
    action_repo_v2 { __typename ... on Pipe { id name } ... on Table { id name } }
    action_params {
      to_phase_id card_id fields_map_order strategy httpMethod url
      phase { id name }
      field_map { fieldId inputMode value }
      email_template_id
    }
  }
} }`;

export async function consultar(token: string, query: string, variables: Record<string, unknown>) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error(`Pipefy respondeu ${r.status}`);
  const j = (await r.json()) as { data?: Record<string, unknown>; errors?: { message: string }[] };
  return { data: j.data ?? {}, erros: (j.errors ?? []).map((e) => e.message) };
}

const hostDe = (url: unknown) => {
  try {
    return typeof url === "string" && url ? new URL(url).host : null;
  } catch {
    return null;
  }
};

async function exportar(token: string, id: string, comRegistros = false) {
  const naoExportavel: string[] = [];
  let tipo: "pipe" | "table" = "pipe";
  // Database tem id alfanumérico (e um pipe interno com o mesmo id): tenta database primeiro.
  const pareceTabela = !/^d+$/.test(id);
  const rp = pareceTabela ? { data: {} as Record<string, unknown>, erros: [] as string[] } : await consultar(token, Q_PIPE, { id });
  let repo = rp.data.pipe as Record<string, unknown> | null;
  if (rp.erros.length) console.warn(`${id}: consulta de pipe com erros: ${rp.erros.slice(0, 5).join("; ")}`);
  if (!repo || !Array.isArray(repo.phases)) {
    const t = await consultar(token, Q_TABELA, { id });
    if (t.erros.length && !t.data.table) throw new Error(`${id}: ${t.erros.join("; ")}`);
    repo = t.data.table as Record<string, unknown> | null;
    tipo = "table";
  }
  if (!repo) throw new Error(`${id}: pipe/database não encontrado ou sem acesso`);

  const automacoes: Record<string, unknown>[] = [];
  const org = repo.organizationId ?? null;
  if (tipo === "pipe" && org) {
    let after: string | null = null;
    do {
      const r = await consultar(token, Q_AUTOMACOES, { org, repo: id, after });
      if (r.erros.length) {
        naoExportavel.push(`automações: ${r.erros.join("; ")}`);
        break;
      }
      const con = r.data.automations as { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Record<string, unknown>[] };
      for (const a of con.nodes) {
        const p = (a.action_params ?? {}) as Record<string, unknown>;
        automacoes.push({ ...a, action_params: { ...p, url: undefined, url_host: hostDe(p.url) } });
      }
      after = con.pageInfo.hasNextPage ? con.pageInfo.endCursor : null;
    } while (after);
  } else if (tipo === "table") {
    naoExportavel.push("automações de databases: não consultadas (o export lista automações por pipe)");
  }
  let registros: { id: string; title: string }[] | undefined;
  if (tipo === "table" && comRegistros) {
    registros = [];
    let after: string | null = null;
    do {
      const r = await consultar(token, Q_REGISTROS, { id, after });
      if (r.erros.length) {
        naoExportavel.push(`registros: ${r.erros.join("; ")}`);
        break;
      }
      const con = r.data.table_records as { pageInfo: { hasNextPage: boolean; endCursor: string | null }; edges: { node: { id: string; title: string } }[] };
      for (const e of con.edges) registros.push({ id: String(e.node.id), title: String(e.node.title ?? "") });
      after = con.pageInfo.hasNextPage && registros.length < LIMITE_REGISTROS ? con.pageInfo.endCursor : null;
    } while (after);
    if (registros.length >= LIMITE_REGISTROS) naoExportavel.push(`registros: limitado aos primeiros ${LIMITE_REGISTROS}`);
  }
  naoExportavel.push(
    "fórmulas de automação (run_a_formula): a API expõe o mapa de campos, não as operações da fórmula",
    "preencher automaticamente das conexões (autoFillFields): a API só responde para um card de origem; o conversor infere das automações que copiam %{conexão.campo}",
    registros ? "cards e demais campos dos registros: fora do escopo (dos registros, só id e título)" : "valores de exemplo, cards e registros: fora do escopo (só estrutura)",
  );
  return { fonte: "pipefy", versao_export: 1, exportado_em: new Date().toISOString(), id, tipo, repo, automacoes, ...(registros ? { registros } : {}), nao_exportavel: naoExportavel };
}

async function main() {
  try {
    process.loadEnvFile?.();
  } catch {
    // sem .env: usa só as variáveis de ambiente
  }
  const args = process.argv.slice(2);
  const iSaida = args.indexOf("--saida");
  const saida = iSaida >= 0 ? args[iSaida + 1] : "exports/pipefy";
  const ids = args.filter((a, i) => !a.startsWith("--") && (iSaida < 0 || i !== iSaida + 1));
  const comRegistros = args.includes("--registros");
  const token = process.env.PIPEFY_TOKEN?.trim();
  if (!ids.length) throw new Error("uso: pnpm pipefy:export <id> [<id>...] [--saida exports/pipefy] [--registros]");
  if (!token) throw new Error("defina PIPEFY_TOKEN (ambiente ou .env)");
  mkdirSync(saida, { recursive: true });
  for (const id of ids) {
    const e = await exportar(token, id, comRegistros);
    const arq = join(saida, `${id}.json`);
    writeFileSync(arq, JSON.stringify(e, null, 2));
    const r = e.repo as { phases?: unknown[]; start_form_fields?: unknown[]; table_fields?: unknown[] };
    console.log(`${id} (${e.tipo}): ${r.phases?.length ?? 0} fases, ${e.automacoes.length} automações${e.registros ? `, ${e.registros.length} registros` : ""} → ${arq}`);
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/pipefy-export.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
