// Seed de desenvolvimento: workspace "demo" com dados genéricos (loja que vende e entrega).
// Fluxos: Pedidos (Novo → Em separação → Enviado → Entregue) e Entregas (Agendada → Em rota → Entregue →
// Falhou); bases: Itens (do pedido), Clientes e Produtos. Cobre o que o e2e usa: sequência PD-0001,
// relação N:1 com busca, sub-tabela 1:N, rollups, campo condicional, anexo obrigatório, regra em várias
// fases, automação simples e campos por fase. Idempotente: se o workspace demo já existir, não faz nada.
// Cards de exemplo passam pelo core, com datas relativas a hoje.
//   pnpm db:seed            cria o demo se não existir
//   pnpm db:seed --reset    exclui o demo (como a exclusão pela UI) e cria de novo
//   pnpm db:seed --carga[=N] (só para medir) workspace "carga" com N cards genéricos (padrão 5.000) num board
import { and, eq } from "drizzle-orm";
import { db } from "./index";
import { attachments, automations, boards, cards, fieldPhaseSettings, fields, phases, rules, users, workspaceMembers, workspaces } from "./schema";
import { createCard, emitirEventoConfig, excluirWorkspace, garantirIndiceExclusivo, moveCard, updateFields, type Actor } from "../core";
import { hashSenha } from "../server/auth/senha";
import { ArmazenamentoDisco, diretorioAnexos, novaChave } from "../server/anexos/disco";

const EMAIL = process.env.PLEXU_SEED_EMAIL ?? "demo@plexu.dev";
const SENHA = process.env.PLEXU_SEED_SENHA ?? "plexu-demo-2026";

/** Data AAAA-MM-DD a N dias de hoje (fuso de São Paulo). */
const dia = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + n * 86_400_000));

/** CNPJ válido a partir de 12 dígitos (dígitos verificadores calculados). */
function cnpj(base: string): string {
  const dv = (ds: number[]) => {
    const pesos = ds.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = ds.reduce((s, d, i) => s + d * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d = base.split("").map(Number);
  d.push(dv(d));
  d.push(dv(d));
  const s = d.join("");
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}

/**
 * --reset: exclui o workspace demo pelo core, o mesmo caminho da exclusão pela UI. Boards, cards,
 * ligações, comentários, anexos e automações saem; os eventos ficam (append-only), marcados como de
 * workspace excluído, e o slug "demo" é liberado. Depois do commit, apaga os arquivos dos anexos.
 */
async function excluirDemo(ws: { id: string; name: string }, slug = "demo") {
  const [dono] = await db
    .select({ id: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.orgRole, "owner")))
    .limit(1);
  const donoId = dono?.id;
  if (!donoId) throw new Error(`seed: o workspace '${slug}' não tem owner; não há quem o exclua.`);
  const r = await excluirWorkspace({ workspaceId: ws.id, actor: { type: "user", id: donoId }, confirmacao: ws.name });
  const armazenamento = new ArmazenamentoDisco(diretorioAnexos());
  let falhas = 0;
  for (const chave of r.chavesAnexos) await armazenamento.remover(chave).catch(() => falhas++);
  const { boards: b, cards: c, anexos } = r.removidos;
  console.log(`seed: workspace '${slug}' excluído (${b} boards, ${c} cards, ${anexos} anexos${falhas ? `; ${falhas} arquivo(s) não removido(s) do disco` : ""}).`);
}

/**
 * --carga[=N]: workspace "carga" (recriado a cada execução) com o board "Volume" e N cards genéricos,
 * 40/30/20/10% nas quatro fases, para medir desempenho. Cards pelo core, em lotes paralelos.
 */
async function carga(n: number) {
  let [u] = await db.select().from(users).where(eq(users.email, EMAIL));
  if (!u) [u] = await db.insert(users).values({ email: EMAIL, name: "Demo", auth: { senha: await hashSenha(SENHA), sv: 0 } }).returning();
  const actor: Actor = { type: "user", id: u.id };
  const [antigo] = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(eq(workspaces.slug, "carga"));
  if (antigo) await excluirDemo(antigo, "carga");
  const { boardId, fases } = await db.transaction(async (tx) => {
    const [ws] = await tx.insert(workspaces).values({ slug: "carga", name: "Volume de carga", settings: { timezone: "America/Sao_Paulo" } }).returning();
    await tx.insert(workspaceMembers).values({ workspaceId: ws.id, userId: u.id, orgRole: "owner" });
    const [b] = await tx.insert(boards).values({ workspaceId: ws.id, slug: "volume", name: "Volume", kind: "workflow" }).returning();
    const fases: string[] = [];
    for (const [i, name] of ["Entrada", "Triagem", "Execução", "Concluído"].entries()) {
      const [p] = await tx.insert(phases).values({ boardId: b.id, name, position: i, isTerminal: i === 3 }).returning();
      fases.push(p.id);
    }
    const campos: [string, string, string, Record<string, unknown>][] = [
      ["titulo", "Título", "text", {}],
      ["valor", "Valor", "currency", { currency: { code: "BRL" } }],
      ["data", "Data", "date", {}],
      ["categoria", "Categoria", "select", { options: ["A", "B", "C"] }],
    ];
    const ids: string[] = [];
    for (const [i, [slug, name, type, config]] of campos.entries()) {
      const [f] = await tx.insert(fields).values({ boardId: b.id, slug, name, type: type as never, position: i, config }).returning();
      ids.push(f.id);
    }
    await tx.update(boards).set({ titleFieldId: ids[0] }).where(eq(boards.id, b.id));
    return { boardId: b.id, fases };
  });
  const cotas = [0.4, 0.3, 0.2, 0.1].map((p) => Math.floor(n * p));
  cotas[0] += n - cotas.reduce((a, b) => a + b, 0);
  const tarefas = cotas.flatMap((q, f) => Array.from({ length: q }, (_, i) => ({ fase: fases[f], i })));
  const inicio = Date.now();
  for (let k = 0; k < tarefas.length; k += 16) {
    await Promise.all(
      tarefas.slice(k, k + 16).map(({ fase, i }, j) =>
        createCard({
          boardId,
          phaseId: fase,
          props: { titulo: `Item ${String(k + j + 1).padStart(5, "0")}`, valor: ((k + j) % 97) * 10.5, data: dia(((k + j) % 60) - 30), categoria: ["A", "B", "C"][i % 3] },
          actor,
        }),
      ),
    );
    if ((k / 16) % 40 === 0) process.stdout.write(`seed --carga: ${k + 16 > tarefas.length ? tarefas.length : k + 16}/${tarefas.length}`);
  }
  console.log(`
seed --carga: ${n} cards em /w/carga/b/volume (${cotas.join("/")} por fase) em ${Math.round((Date.now() - inicio) / 1000)}s. Login: ${EMAIL}`);
}

async function main() {
  const argCarga = process.argv.find((a) => a === "--carga" || a.startsWith("--carga="));
  if (argCarga) {
    const n = argCarga.includes("=") ? Number(argCarga.split("=")[1]) : 5000;
    if (!Number.isInteger(n) || n < 1 || n > 100_000) throw new Error("--carga=N: N inteiro de 1 a 100.000");
    return carga(n);
  }
  const reset = process.argv.includes("--reset");
  const [existe] = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(eq(workspaces.slug, "demo"));
  if (existe && !reset) {
    console.log("seed: workspace 'demo' já existe; nada a fazer (--reset exclui e cria de novo).");
    return;
  }
  if (existe) await excluirDemo(existe);

  const ids = await db.transaction(async (tx) => {
    let [u] = await tx.select().from(users).where(eq(users.email, EMAIL));
    if (!u) {
      [u] = await tx.insert(users).values({ email: EMAIL, name: "Demo", auth: { senha: await hashSenha(SENHA), sv: 0 } }).returning();
    }
    const actor: Actor = { type: "user", id: u.id };
    const [ws] = await tx.insert(workspaces).values({ slug: "demo", name: "Demo", settings: { timezone: "America/Sao_Paulo" } }).returning();
    await tx.insert(workspaceMembers).values({ workspaceId: ws.id, userId: u.id, orgRole: "owner" });
    // Pessoas da equipe (sem login): responsáveis nos cartões.
    const equipe: Record<string, string> = {};
    for (const [nome, email] of [
      ["Ana Ribeiro", "ana@demo.plexu.dev"],
      ["Marcos Costa", "marcos@demo.plexu.dev"],
    ]) {
      let [p] = await tx.select().from(users).where(eq(users.email, email));
      if (!p) [p] = await tx.insert(users).values({ email, name: nome, auth: {} }).returning();
      await tx.insert(workspaceMembers).values({ workspaceId: ws.id, userId: p.id, orgRole: "member" });
      equipe[nome] = p.id;
    }
    const cfg = (boardId: string | null, entidade: "workspace" | "board" | "phase" | "field" | "rule" | "automation", id: string, dados?: Record<string, unknown>) =>
      emitirEventoConfig(tx, { workspaceId: ws.id, boardId, actor }, { entidade, acao: "created", id, dados });
    await cfg(null, "workspace", ws.id, { slug: "demo", seed: true });

    const board = async (slug: string, name: string, kind: "workflow" | "database") => {
      const [b] = await tx.insert(boards).values({ workspaceId: ws.id, slug, name, kind }).returning();
      await cfg(b.id, "board", b.id);
      return b.id;
    };
    const fasesDe = async (boardId: string, lista: { name: string; terminal?: boolean; descricao?: string; slaDias?: number }[]) => {
      const f: Record<string, string> = {};
      for (const [i, x] of lista.entries()) {
        const [p] = await tx
          .insert(phases)
          .values({
            boardId,
            name: x.name,
            position: i,
            isTerminal: x.terminal ?? false,
            settings: x.descricao ? { description: x.descricao } : {},
            sla: x.slaDias ? { duration: x.slaDias, unit: "days" } : null,
          })
          .returning();
        f[x.name] = p.id;
        await cfg(boardId, "phase", p.id, { name: x.name });
      }
      return f;
    };
    const campo = async (
      boardId: string,
      slug: string,
      name: string,
      type: string,
      position: number,
      config: Record<string, unknown> = {},
      extra: { visibleExpr?: string; requiredExpr?: string; helpText?: string } = {},
    ) => {
      const [f] = await tx.insert(fields).values({ boardId, slug, name, type: type as never, position, config, ...extra }).returning();
      await cfg(boardId, "field", f.id, { slug, type });
      return f.id;
    };
    const titulo = (boardId: string, fieldId: string) => tx.update(boards).set({ titleFieldId: fieldId }).where(eq(boards.id, boardId));

    // Bases ----------------------------------------------------------------
    const bCli = await board("clientes", "Clientes", "database");
    await titulo(bCli, await campo(bCli, "nome", "Nome", "text", 0));
    await campo(bCli, "cnpj", "CNPJ", "cnpj", 1);
    await campo(bCli, "cidade", "Cidade", "text", 2);
    await campo(bCli, "situacao", "Situação", "select", 3, { options: ["Ativo", "Inativo"] });

    const bProd = await board("produtos", "Produtos", "database");
    await titulo(bProd, await campo(bProd, "nome", "Nome", "text", 0));
    await campo(bProd, "sku", "SKU", "text", 1);
    await campo(bProd, "preco", "Preço", "currency", 2, { currency: { code: "BRL" } });

    // Itens do pedido: o "Adicionar" rápido da sub-tabela cobre os campos (sem obrigatórios).
    const bItens = await board("itens", "Itens", "database");
    await titulo(bItens, await campo(bItens, "numero", "Número", "sequence", 0, { sequence: { pattern: "IT-{n}", scope: "global", seed: 1, pad: 4 } }));
    await campo(bItens, "descricao", "Descrição", "text", 1);
    await campo(bItens, "valor", "Valor", "currency", 2, { currency: { code: "BRL" } });
    await campo(bItens, "quantidade", "Qtd.", "number", 3);
    await campo(bItens, "separado", "Separado", "boolean", 4);
    await campo(bItens, "separado_em", "Separado em", "date", 5);
    await campo(bItens, "produto", "Produto", "relation", 6, { relation: { target_board: bProd, cardinality: "one", inverse_name: "itens", show_on_card: true } });

    // Entregas (fluxo): instruções obrigatórias em texto longo, que o "Adicionar" rápido não cobre;
    // na sub-tabela do pedido o botão abre o formulário completo já vinculado.
    const bEnt = await board("entregas", "Entregas", "workflow");
    const fEnt = await fasesDe(bEnt, [
      { name: "Agendada", descricao: "Entregas combinadas com o cliente, aguardando a saída.", slaDias: 3 },
      { name: "Em rota", descricao: "Entregas chegam aqui quando saem do depósito." },
      { name: "Entregue", terminal: true, descricao: "Entregas concluídas." },
      { name: "Falhou", terminal: true, descricao: "Entregas que não puderam ser concluídas." },
    ]);
    await titulo(bEnt, await campo(bEnt, "descricao", "Descrição", "text", 0));
    const eTipo = await campo(bEnt, "tipo", "Tipo", "select", 1, { options: ["Normal", "Expressa"] });
    const eValor = await campo(bEnt, "valor", "Valor", "currency", 2, { currency: { code: "BRL" } });
    const ePrevisao = await campo(bEnt, "previsao", "Previsão", "date", 3);
    await campo(bEnt, "instrucoes", "Instruções", "long_text", 4, {}, { requiredExpr: "true", helpText: "Como e onde entregar." });
    const eConferido = await campo(bEnt, "conferido", "Conferido", "boolean", 5);
    await campo(bEnt, "entregador", "Entregador", "person", 6);

    // Pedidos (fluxo) -------------------------------------------------------
    const bPed = await board("pedidos", "Pedidos", "workflow");
    const fPed = await fasesDe(bPed, [
      { name: "Novo", descricao: "Pedidos recebidos, aguardando conferência." },
      { name: "Em separação", descricao: "Itens sendo separados no depósito.", slaDias: 2 },
      { name: "Enviado", descricao: "Pedidos a caminho do cliente." },
      { name: "Entregue", terminal: true, descricao: "Pedidos concluídos." },
    ]);
    // Fases de preenchimento (decisão 18-revisada): dados do pedido no Novo, somente leitura depois (o
    // contato pode ser corrigido em qualquer fase); "Valor enviado" aparece a partir do Enviado.
    const novo = { fill_phases: [fPed["Novo"]] };
    const pNumero = await campo(bPed, "numero", "Número", "sequence", 0, { sequence: { pattern: "PD-{n}", scope: "global", seed: 1, pad: 4 } });
    const pRef = await campo(bPed, "referencia", "Referência", "text", 1, novo);
    await campo(bPed, "contato", "Contato", "text", 2, { ...novo, editable_everywhere: true });
    await campo(bPed, "cnpj", "CNPJ", "cnpj", 3, novo);
    const pItens = await campo(bPed, "itens", "Itens", "relation", 4, { relation: { target_board: bItens, cardinality: "many", exclusive: true, inverse_name: "pedido" } });
    await garantirIndiceExclusivo(tx, pItens);
    const pQtd = await campo(bPed, "qtd_itens", "Qtd. itens", "rollup", 5, { ...novo, rollup: { via_field: pItens, agg: "count" } });
    const pTotal = await campo(bPed, "valor_total", "Valor total", "rollup", 6, { ...novo, rollup: { via_field: pItens, agg: "sum", expr: "valor", format: "currency" } });
    await campo(bPed, "valor_enviado", "Valor enviado", "rollup", 7, {
      fill_phases: [fPed["Enviado"]],
      rollup: { via_field: pItens, agg: "sum", expr: "valor", filter_expr: "card.separado == true", format: "currency" },
    });
    await campo(bPed, "resumo", "Resumo", "dynamic_text", 8, { ...novo, dynamic_text: { template: "{numero} · {qtd_itens} item(ns)" } });
    const pEntregas = await campo(bPed, "entregas", "Entregas", "relation", 9, { relation: { target_board: bEnt, cardinality: "many", exclusive: true, inverse_name: "pedido" } });
    await garantirIndiceExclusivo(tx, pEntregas);
    await campo(bPed, "expressa", "Entrega expressa", "boolean", 10, novo);
    await campo(bPed, "janela", "Janela de entrega", "text", 11, novo, { visibleExpr: "card.expressa == true", requiredExpr: "card.expressa == true" });
    await campo(bPed, "cliente", "Cliente", "relation", 12, { ...novo, relation: { target_board: bCli, cardinality: "one", inverse_name: "pedidos", show_on_card: true } });
    const pComprovante = await campo(bPed, "comprovante", "Comprovante do pedido", "attachment", 13, { ...novo, accept: ".pdf,.docx" }, { requiredExpr: "true", helpText: "PDF ou Word do pedido." });
    await campo(bPed, "responsavel", "Responsável", "person", 14, novo);
    const pAte = await campo(bPed, "entrega_ate", "Entrega até", "date", 15, novo);
    await titulo(bPed, pNumero);
    await tx.insert(fieldPhaseSettings).values({ fieldId: pRef, phaseId: fPed["Novo"], required: true });

    // Entregas: cliente do pedido (espelho), para o cartão do kanban.
    const eCliente = await campo(bEnt, "cliente", "Cliente", "lookup", 7, { lookup: { via_field: pEntregas, path: "cliente", mode: "ref" } });

    // Cartões dos kanbans: campos resumidos (até 8) + prazo; o cliente do pedido aparece como conexão.
    await tx.update(boards).set({ settings: { kanban_fields: [pRef, pTotal, pQtd], kanban_due_field: pAte } }).where(eq(boards.id, bPed));
    await tx.update(boards).set({ settings: { kanban_fields: [eTipo, eValor, ePrevisao, eCliente, eConferido], kanban_due_field: ePrevisao } }).where(eq(boards.id, bEnt));

    // Regra em várias fases: só envia (ou entrega) com todos os itens separados.
    const [regra] = await tx
      .insert(rules)
      .values({
        boardId: bPed,
        kind: "can_enter",
        phaseIds: [fPed["Enviado"], fPed["Entregue"]],
        expr: 'filhos("itens").contar() > 0 && filhos("itens").todos(i, i.separado == true)',
        message: "Todos os itens precisam estar separados (e deve haver ao menos um).",
      })
      .returning();
    await cfg(bPed, "rule", regra.id, { kind: "can_enter" });

    // Automação simples: todas as entregas do pedido entregues → pedido vai para Entregue.
    const [auto] = await tx
      .insert(automations)
      .values({
        workspaceId: ws.id,
        boardId: bPed,
        name: "Concluir pedido quando todas as entregas chegarem",
        trigger: { type: "all_children_in_phase", relation: pEntregas, phase: fEnt["Entregue"] },
        steps: [{ type: "move_card", phase: fPed["Entregue"] }],
        env: "published",
        publishedVersion: 1,
      })
      .returning();
    await cfg(bPed, "automation", auto.id, { name: auto.name });

    return { actor, ws: ws.id, userId: u.id, equipe, bCli, bProd, bItens, bEnt, bPed, fEnt, fPed, pComprovante };
  });

  const a = ids.actor;
  const criar = (boardId: string, props: Record<string, unknown>, extra: { phaseId?: string } = {}) => createCard({ boardId, props, actor: a, ...extra });

  // Clientes e produtos
  const clientes: Record<string, string> = {};
  for (const [nome, doc, cidade] of [
    ["Mercado Aurora", "11.222.333/0001-81", "Belo Horizonte"],
    ["Padaria Central", "45.723.174/0001-10", "Curitiba"],
    ["Loja Horizonte", "11.444.777/0001-61", "Recife"],
    ["Café do Vale", cnpj("203040500001"), "Campinas"],
    ["Armazém Boa Vista", cnpj("314151620001"), "Porto Alegre"],
    ["Floricultura Primavera", cnpj("425262730001"), "Salvador"],
  ])
    clientes[nome] = (await criar(ids.bCli, { nome, cnpj: doc, cidade, situacao: "Ativo" })).id;
  const produtos: Record<string, { id: string; preco: number }> = {};
  for (const [nome, sku, preco] of [
    ["Cadeira Lira", "CAD-001", 890],
    ["Luminária Arco", "LUM-014", 329.9],
    ["Mesa Prisma", "MES-007", 1450],
    ["Kit fixação", "KIT-002", 32.5],
    ["Estante Modular", "EST-021", 760],
    ["Tapete Trama", "TAP-009", 410],
  ] as const)
    produtos[nome] = { id: (await criar(ids.bProd, { nome, sku, preco })).id, preco };

  // Comprovante (PDF mínimo) para cada pedido: arquivo em ATTACHMENTS_DIR, como um upload.
  const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  const armazenamento = new ArmazenamentoDisco(diretorioAnexos());
  const comprovante = async (nome: string) => {
    const chave = novaChave();
    await armazenamento.gravar(chave, pdf);
    const [anexo] = await db
      .insert(attachments)
      .values({ workspaceId: ids.ws, fieldId: ids.pComprovante, storageKey: chave, filename: nome, mime: "application/pdf", size: pdf.length, uploadedBy: ids.userId })
      .returning();
    return anexo.id;
  };

  // Pedidos com itens; os que já saíram têm os itens separados (a regra exige).
  const ana = ids.equipe["Ana Ribeiro"];
  const marcos = ids.equipe["Marcos Costa"];
  const pedidos: { ref: string; cliente: string; fase: string; itens: [string, number][]; resp: string; prazo: number; expressa?: boolean }[] = [
    { ref: "Reposição de vitrine", cliente: "Mercado Aurora", fase: "Novo", itens: [["Cadeira Lira", 1], ["Luminária Arco", 1]], resp: ana, prazo: 6 },
    { ref: "Mobília do salão", cliente: "Padaria Central", fase: "Novo", itens: [["Mesa Prisma", 2]], resp: marcos, prazo: 9 },
    { ref: "Pedido de inauguração", cliente: "Café do Vale", fase: "Novo", itens: [], resp: ids.userId, prazo: 12, expressa: true },
    { ref: "Estantes do depósito", cliente: "Armazém Boa Vista", fase: "Em separação", itens: [["Estante Modular", 3], ["Kit fixação", 6]], resp: ana, prazo: -1 },
    { ref: "Decoração da loja", cliente: "Floricultura Primavera", fase: "Em separação", itens: [["Tapete Trama", 1]], resp: marcos, prazo: 4 },
    { ref: "Cadeiras extras", cliente: "Loja Horizonte", fase: "Enviado", itens: [["Cadeira Lira", 4]], resp: ana, prazo: 2 },
    { ref: "Iluminação do balcão", cliente: "Mercado Aurora", fase: "Enviado", itens: [["Luminária Arco", 2]], resp: ids.userId, prazo: -3 },
    { ref: "Mesa de reunião", cliente: "Padaria Central", fase: "Entregue", itens: [["Mesa Prisma", 1]], resp: marcos, prazo: -8 },
  ];
  const criados: Record<string, string> = {};
  for (const [i, p] of pedidos.entries()) {
    const pedido = await criar(ids.bPed, {
      referencia: p.ref,
      contato: `Compras · ${p.cliente}`,
      cnpj: null,
      cliente: [clientes[p.cliente]],
      comprovante: [await comprovante(`pedido-${String(i + 1).padStart(4, "0")}.pdf`)],
      responsavel: p.resp,
      entrega_ate: dia(p.prazo),
      expressa: p.expressa ?? false,
      ...(p.expressa ? { janela: "08h às 12h" } : {}),
    });
    const itens = [];
    for (const [nome, qtd] of p.itens) {
      const separado = p.fase !== "Novo";
      itens.push(
        (
          await criar(ids.bItens, {
            descricao: nome,
            valor: produtos[nome].preco * qtd,
            quantidade: qtd,
            separado,
            ...(separado ? { separado_em: dia(-2) } : {}),
            produto: [produtos[nome].id],
          })
        ).id,
      );
    }
    if (itens.length) await updateFields({ cardId: pedido.id, props: { itens }, actor: a });
    // Avança fase a fase até a fase do exemplo (as regras valem como em qualquer canal).
    const ordem = ["Novo", "Em separação", "Enviado", "Entregue"];
    for (const fase of ordem.slice(1, ordem.indexOf(p.fase) + 1)) await moveCard({ cardId: pedido.id, toPhaseId: ids.fPed[fase], actor: a });
    criados[p.ref] = pedido.id;
  }

  // Entregas ligadas aos pedidos (título "PD-xxxx · volume n/m").
  const entregas: { pedido: string; vol: string; tipo: string; fase: string; previsao: number; resp: string }[] = [
    { pedido: "Estantes do depósito", vol: "1/2", tipo: "Expressa", fase: "Agendada", previsao: 5, resp: ana },
    { pedido: "Estantes do depósito", vol: "2/2", tipo: "Normal", fase: "Agendada", previsao: 10, resp: marcos },
    { pedido: "Decoração da loja", vol: "1/1", tipo: "Normal", fase: "Agendada", previsao: -1, resp: ana },
    { pedido: "Cadeiras extras", vol: "1/2", tipo: "Expressa", fase: "Em rota", previsao: 1, resp: marcos },
    { pedido: "Cadeiras extras", vol: "2/2", tipo: "Normal", fase: "Em rota", previsao: -2, resp: ana },
    { pedido: "Iluminação do balcão", vol: "1/1", tipo: "Expressa", fase: "Falhou", previsao: -3, resp: ids.userId },
    { pedido: "Mesa de reunião", vol: "1/1", tipo: "Normal", fase: "Entregue", previsao: -8, resp: marcos },
    { pedido: "Reposição de vitrine", vol: "1/1", tipo: "Normal", fase: "Agendada", previsao: 7, resp: ids.userId },
  ];
  const porPedido = new Map<string, string[]>();
  for (const e of entregas) {
    const pedidoId = criados[e.pedido];
    const [{ title }] = await db.select({ title: cards.title }).from(cards).where(eq(cards.id, pedidoId));
    const valor = pedidos.find((p) => p.ref === e.pedido)!.itens.reduce((s, [n, q]) => s + produtos[n].preco * q, 0);
    const ent = await criar(
      ids.bEnt,
      {
        descricao: `${title} · volume ${e.vol}`,
        tipo: e.tipo,
        valor,
        previsao: dia(e.previsao),
        instrucoes: "Entregar no período da manhã, pela doca de recebimento.",
        conferido: e.fase !== "Agendada",
        entregador: e.resp,
      },
      { phaseId: ids.fEnt[e.fase] },
    );
    porPedido.set(pedidoId, [...(porPedido.get(pedidoId) ?? []), ent.id]);
  }
  for (const [pedidoId, lista] of porPedido) await updateFields({ cardId: pedidoId, props: { entregas: lista }, actor: a });

  console.log(`seed: workspace 'demo' criado. Login: ${EMAIL} / ${SENHA}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
