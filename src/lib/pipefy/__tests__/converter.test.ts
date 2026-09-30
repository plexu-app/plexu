// Conversor Pipefy → template com um export FICTÍCIO (pedidos com itens), montado aqui.
import { describe, expect, it } from "vitest";
import { validarTemplate } from "../../template";
import { anonimizarExports, converterPipefy, regexDoPipefy, semParenteses } from "../converter";
import type { PfAutomacao, PfCampo, PfExport } from "../export";
import { relatorioMarkdown } from "../relatorio";

const campo = (id: string, internal: string, label: string, type: string, extra: Partial<PfCampo> = {}): PfCampo => ({
  id,
  internal_id: internal,
  label,
  type,
  required: false,
  editable: false,
  ...extra,
});

const ITENS: PfExport = {
  fonte: "pipefy",
  id: "2002",
  tipo: "table",
  repo: {
    id: "2002",
    name: "Itens do pedido",
    title_field: { id: "descricao" },
    table_fields: [
      campo("descricao", "900", "Descrição", "short_text", { required: true, custom_validation: "\\A[A-Z0-9]+\\z", help: "Código em maiúsculas, sem espaços." }),
      campo("valor", "901", "Valor", "currency"),
      campo("aprovado", "902", "Aprovado", "radio_vertical", { options: ["Sim", "Não"] }),
      campo("cnpj_pedido", "903", "CNPJ do pedido", "cnpj"),
    ],
  },
  automacoes: [],
};

const serie = (n: number) => String(n).padStart(2, "0");
const item = (n: number) => campo(`item_${n}`, `10${n}`, `Item ${serie(n)}`, "connector", { connectedRepo: { id: "2002", name: "Itens do pedido" }, canConnectMultiples: false });
const aprovar = (n: number) => campo(`aprovar_${n}`, `20${n}`, `Aprovar item ${serie(n)}`, "radio_horizontal", { options: ["Sim", "Não"] });

const auto = (id: string, name: string, a: Partial<PfAutomacao>): PfAutomacao => ({
  id,
  name,
  active: true,
  event_id: "field_updated",
  action_id: "update_card_field",
  event_repo: { id: "1001" },
  ...a,
});

const somas = [1, 2, 3].map((n) =>
  auto(`s${n}`, `Somar total ${n}/3`, {
    action_id: "run_a_formula",
    action_repo_v2: { id: "1001" },
    action_params: { field_map: [{ fieldId: "300", value: `SUM( ${[1, 2, 3].slice(0, n).map((i) => `%{10${i}.901}`).join(",")} )` }] },
  }),
);

const PEDIDOS: PfExport = {
  fonte: "pipefy",
  id: "1001",
  tipo: "pipe",
  repo: {
    id: "1001",
    name: "Pedidos de compra",
    // Título = conexão: vira lookup do título do card ligado
    title_field: { id: "principal" },
    start_form_fields: [
      campo("titulo", "1", "Título", "short_text", { required: true }),
      campo("tipo", "2", "Tipo", "radio_vertical", { options: ["Compra", "Serviço"] }),
      campo("cnpj", "3", "CNPJ", "cnpj"),
      campo("aviso", "4", "Leia antes", "statement"),
      campo("fornecedor", "5", "Fornecedor", "connector", { connectedRepo: { id: "3003", name: "Fornecedores" }, canConnectMultiples: false }),
      campo("principal", "6", "Item principal", "connector", { connectedRepo: { id: "2002", name: "Itens do pedido" }, canConnectMultiples: false }),
      campo("marcadores", "7", "Marcadores", "label_select"),
      campo("justificativa", "8", "Justificativa", "long_text"),
    ],
    labels: [{ id: "77", name: "Urgente" }, { id: "78", name: "Rotina" }],
    // No Pipefy, a condição sobre etiquetas compara o id da etiqueta
    startFormFieldConditions: [
      {
        id: "fc0",
        name: "Justificativa se urgente",
        condition: { expressions: [{ structure_id: "0", field_address: "7", operation: "equals", value: "77" }], expressions_structure: [["0"]] },
        actions: [{ actionId: "show", whenEvaluator: true, phaseField: { id: "justificativa" } }],
      },
    ],
    phases: [
      {
        id: "10",
        name: "Abertura",
        index: 0,
        fields: [item(1), item(2), item(3), aprovar(1), aprovar(2), aprovar(3), campo("total", "300", "Total", "currency"), campo("aprovado_total", "301", "Total aprovado", "currency")],
        fieldConditions: [
          {
            id: "fc1",
            name: "Observação só para serviço",
            condition: { expressions: [{ structure_id: "0", field_address: "2", operation: "equals", value: "Serviço" }], expressions_structure: [["0"]] },
            actions: [
              { actionId: "show", whenEvaluator: true, phaseField: { id: "obs" } },
              { actionId: "hide", whenEvaluator: false, phaseField: { id: "obs" } },
            ],
          },
        ],
      },
      { id: "11", name: "Aprovação", index: 1, fields: [campo("obs", "400", "Observação", "long_text", { editable: true }), campo("saldo", "401", "Saldo", "currency")] },
      { id: "12", name: "Entrega", index: 2, done: true, fields: [] },
    ],
  },
  automacoes: [
    ...somas,
    auto("sub", "Calcular saldo", { action_id: "run_a_formula", action_repo_v2: { id: "1001" }, action_params: { field_map: [{ fieldId: "401", value: "SUBTRACT( %{300}, %{301} )" }] } }),
    ...[1, 2, 3].map((n) =>
      auto(`ap${n}`, `Aprovar item ${serie(n)}`, {
        event_params: { triggerFields: [{ id: `aprovar_${n}` }] },
        action_repo_v2: { id: "2002" },
        action_params: { field_map: [{ fieldId: "902", inputMode: "copy_from", value: `%{20${n}}` }] },
      }),
    ),
    ...["11", "12"].map((fase, i) =>
      auto(`b${i}`, `Impedir sem valor do item${i ? " (cópia 1)" : ""}`, {
        event_id: "card_moved",
        action_id: "move_single_card",
        event_params: { to_phase_id: fase },
        condition: { expressions: [{ structure_id: "0", field_address: "101.901", operation: "blank", value: "" }], expressions_structure: [["0"]] },
        action_params: { to_phase_id: "10" },
      }),
    ),
    // Cópia de um campo do pedido para cada item: vira lookup "ref" no item
    ...[1, 2].map((n) =>
      auto(`cp${n}`, `Copiar CNPJ para o item ${serie(n)}`, {
        condition: { expressions: [{ structure_id: "0", field_address: `10${n}`, operation: "present", value: "" }], expressions_structure: [["0"]] },
        action_repo_v2: { id: "2002" },
        action_params: { field_map: [{ fieldId: "903", inputMode: "copy_from", value: "%{3}" }] },
      }),
    ),
    auto("mail", "Avisar solicitante", { event_id: "card_created", action_id: "send_email_template" }),
    ...[1, 2].map((n) => auto(`n${n}`, `Notificar item ${serie(n)}`, { action_id: "send_http_request" })),
  ],
};
// A API lista a automação também no pipe onde ela age: aparece no export dos itens (duplicada).
ITENS.automacoes = [PEDIDOS.automacoes.find((a) => a.id === "ap1")!];

const linhas0 = (r: ReturnType<typeof converterPipefy>["relatorio"]) => r.boards[0].automacoes;
const conv = () => converterPipefy([PEDIDOS, ITENS], { nome: "Pedidos" });
const board = (key: string) => conv().template.boards.find((b) => b.key === key)!;

describe("converterPipefy", () => {
  it("gera template válido, com boards, fases e tipos mapeados", () => {
    const { template } = conv();
    expect(validarTemplate(template)).toEqual([]);
    expect(template.boards.map((b) => [b.key, b.kind])).toEqual([
      ["pedidos-de-compra", "workflow"],
      ["itens-do-pedido", "database"],
    ]);
    const p = board("pedidos-de-compra");
    expect(p.phases).toEqual([{ key: "abertura", name: "Abertura" }, { key: "aprovacao", name: "Aprovação" }, { key: "entrega", name: "Entrega", terminal: true }]);
    const f = (k: string) => p.fields.find((x) => x.key === k);
    expect(f("titulo")).toMatchObject({ type: "text", required: "true", fill_phases: ["abertura"] });
    expect(f("tipo")).toMatchObject({ type: "select", options: ["Compra", "Serviço"] });
    expect(f("cnpj")?.type).toBe("cnpj");
    expect(f("aviso")).toBeUndefined(); // statement
    expect(f("observacao")).toMatchObject({ type: "long_text", fill_phases: ["aprovacao"], editable_everywhere: true, visible: 'card.tipo == "Serviço"' });
    expect(p.title_field).toBe("item_principal_titulo");
    expect(f("item_principal_titulo")).toMatchObject({ type: "lookup", lookup: { via: "item_principal", path: "titulo", mode: "ref" } });
    // Conexão de 1 card: cardinality one, nunca exclusiva (só por opção explícita no template)
    expect(f("item_principal")?.relation).toEqual({ board: "itens-do-pedido", cardinality: "one" });
  });

  it("série de conexões numeradas vira relação 1:N; série de campos alinhada vira o campo do filho", () => {
    const p = board("pedidos-de-compra");
    expect(p.fields.find((f) => f.key === "items")).toMatchObject({
      type: "relation",
      relation: { board: "itens-do-pedido", cardinality: "many" },
    });
    expect(p.fields.some((f) => /item_0|aprovar/.test(f.key))).toBe(false);
    // "Aprovar item NN" era copiado para itens.aprovado: nenhum campo novo no filho
    expect(board("itens-do-pedido").fields.map((f) => f.key)).toEqual(["descricao", "valor", "aprovado", "cnpj_do_pedido"]);
    // Cópia do pedido para cada item → lookup ref no item, pela relação da série
    expect(board("itens-do-pedido").fields.find((f) => f.key === "cnpj_do_pedido")).toMatchObject({ type: "lookup", lookup: { via: "pedidos-de-compra.items", path: "cnpj", mode: "ref" } });
  });

  it("fórmulas: SUM sobre a série vira rollup; SUBTRACT entre campos do card vira texto calculado", () => {
    const p = board("pedidos-de-compra");
    expect(p.fields.find((f) => f.key === "total")).toMatchObject({ type: "rollup", rollup: { via: "items", agg: "sum", expr: "valor", format: "currency" } });
    expect(p.fields.find((f) => f.key === "saldo")).toMatchObject({ type: "dynamic_text", dynamic_text: { template: "{card.total - card.total_aprovado}" } });
  });

  it("'move de volta se' em várias fases vira uma regra can_enter", () => {
    const p = board("pedidos-de-compra");
    expect(p.rules).toEqual([
      {
        kind: "can_enter",
        phase: null,
        expr: '!(fase_destino in ["Aprovação", "Entrega"]) || !(filhos("items").algum(p, p.valor == null))',
        message: "Impedir sem valor do item",
      },
    ]);
  });

  it("automações sem equivalente ficam pendentes; séries numeradas viram uma só; duplicatas da API contam uma vez", () => {
    const { template, relatorio } = conv();
    const p = template.boards[0];
    expect(p.automations?.map((a) => a.name)).toEqual(["Avisar solicitante", "Notificar item N (série de 2)"]);
    expect(template.boards[1].automations).toBeUndefined();
    expect(relatorio.totais).toMatchObject({ automacoes: 14, regras: 1, rollups: 1, textosCalculados: 1, lookups: 2, absorvidas: 3, pendentes: 2 });
    expect(linhas0(relatorio).filter((l) => l.destino === "lookup").map((l) => l.ref)).toEqual(["itens-do-pedido.cnpj_do_pedido", "itens-do-pedido.cnpj_do_pedido"]);
    const linhas = relatorio.boards[0].automacoes;
    expect(linhas.filter((l) => l.destino === "rollup").map((l) => l.ref)).toEqual(["total", "total", "total"]);
    expect(linhas.find((l) => l.origem === "Calcular saldo")?.destino).toBe("dynamic_text");
  });

  it("relatório registra conexões para fora, statements e condicionais", () => {
    const { relatorio } = conv();
    const r = relatorio.boards[0];
    expect(r.conexoes.find((c) => c.campo === "Fornecedor")?.destino).toMatch(/não convertida/);
    expect(r.naoRepresentado.map((n) => n.item)).toEqual(expect.arrayContaining(["Leia antes", "Fornecedor"]));
    expect(r.condicionais).toEqual({ total: 2, convertidas: 2, naoConvertidas: [] });
    const md = relatorioMarkdown(relatorio);
    expect(md).toContain("14 automações no Pipefy");
    expect(md).toContain("| Pedidos de compra (pipe) |");
  });

  it("--anonimizar troca nomes por genéricos e preserva a estrutura", () => {
    const { template, relatorio } = converterPipefy([PEDIDOS, ITENS], { anonimizar: true });
    const texto = JSON.stringify(template) + relatorioMarkdown(relatorio);
    for (const nome of ["Pedidos", "Itens", "Aprovação", "Observação", "Serviço", "Fornecedores", "Notificar", "Avisar", "saldo"]) expect(texto).not.toContain(nome);
    expect(validarTemplate(template)).toEqual([]);
    const p = template.boards[0];
    expect(p.name).toBe("Board A");
    expect(p.fields.filter((f) => f.type === "rollup")).toHaveLength(1);
    expect(p.fields.filter((f) => f.type === "relation" && f.relation?.cardinality === "many")).toHaveLength(1);
    expect(p.rules).toHaveLength(1);
    expect(relatorio.anonimizado).toBe(true);
  });

  it("anonimizar não altera os exports originais", () => {
    const antes = JSON.stringify(PEDIDOS);
    anonimizarExports([PEDIDOS]);
    expect(JSON.stringify(PEDIDOS)).toBe(antes);
  });
});

describe("formato e título", () => {
  it("regex do Pipefy vira validation com o texto de ajuda como mensagem (âncoras Ruby → JS)", () => {
    const itens = board("itens-do-pedido");
    expect(itens.fields.find((f) => f.key === "descricao")).toMatchObject({
      help: "Código em maiúsculas, sem espaços.",
      validation: { regex: "^[A-Z0-9]+$", message: "Código em maiúsculas, sem espaços." },
    });
    expect(regexDoPipefy("^[A-Z ]+$")).toBe("^[A-Z ]+$");
    expect(regexDoPipefy("([")).toBeNull();
  });

  it("condição sobre etiqueta compara pelo nome (o Pipefy usa o id da etiqueta)", () => {
    const p = board("pedidos-de-compra");
    expect(p.fields.find((f) => f.key === "marcadores")).toMatchObject({ type: "multi_select", options: ["Urgente", "Rotina"] });
    expect(p.fields.find((f) => f.key === "justificativa")?.visible).toBe('card.marcadores != null && "Urgente" in card.marcadores');
  });

  it("sem título marcado no Pipefy: primeiro texto obrigatório", () => {
    const semTitulo: PfExport = {
      ...ITENS,
      id: "4004",
      repo: {
        ...ITENS.repo,
        id: "4004",
        name: "Cadastro",
        title_field: null,
        table_fields: [campo("obs", "950", "Observação", "short_text"), campo("nome", "951", "Nome", "short_text", { required: true })],
      },
      automacoes: [],
    };
    expect(converterPipefy([semTitulo]).template.boards[0].title_field).toBe("nome");
  });
});

describe("semParenteses", () => {
  it("só tira parênteses que envolvem tudo", () => {
    expect(semParenteses("((a))")).toBe("a");
    expect(semParenteses("(a) && !(b)")).toBe("(a) && !(b)");
  });
});

describe("mapeamento de tipos Pipefy → Plexu", () => {
  // Um campo de cada tipo, num database fictício (sem fases), para checar só o tipo resultante.
  const tipos: [string, string][] = [
    ["short_text", "text"],
    ["long_text", "long_text"],
    ["email", "text"],
    ["phone", "text"],
    ["time", "text"],
    ["number", "number"],
    ["currency", "currency"],
    ["date", "date"],
    ["datetime", "datetime"],
    ["due_date", "datetime"],
    ["select", "select"],
    ["radio_vertical", "select"],
    ["radio_horizontal", "select"],
    ["checklist_vertical", "multi_select"],
    ["checklist_horizontal", "multi_select"],
    ["label_select", "multi_select"],
    ["assignee_select", "person"],
    ["attachment", "attachment"],
    ["cpf", "cpf"],
    ["cnpj", "cnpj"],
    ["id", "sequence"],
  ];
  const exp: PfExport = {
    fonte: "pipefy",
    id: "5005",
    tipo: "table",
    repo: {
      id: "5005",
      name: "Tipos",
      labels: [{ id: "1", name: "Etiqueta" }],
      table_fields: [
        campo("nome", "1000", "Nome", "short_text"),
        ...tipos.map(([t], i) => campo(`c_${t}`, String(1001 + i), `Campo ${t}`, t, { options: ["A", "B"], custom_validation: t === "attachment" ? ".pdf, .docx" : null })),
        campo("aviso", "1100", "Aviso", "statement"),
      ],
    },
    automacoes: [],
  };
  const campos = converterPipefy([exp]).template.boards[0].fields;

  it.each(tipos)("%s → %s", (pipefy, plexu) => {
    expect(campos.find((f) => f.name === `Campo ${pipefy}`)?.type).toBe(plexu);
  });

  it("attachment continua anexo; custom_validation (extensões) vira accept, não regex", () => {
    const anexo = campos.find((f) => f.name === "Campo attachment");
    expect(anexo).toMatchObject({ type: "attachment", accept: ".pdf,.docx" });
    expect(anexo?.validation).toBeUndefined();
  });

  it("statement não vira campo", () => {
    expect(campos.find((f) => f.name === "Aviso")).toBeUndefined();
  });
});

describe("preencher automaticamente (conexão)", () => {
  // A config autoFillFields não sai da API: o conversor infere da automação que copia %{conexão.campo}.
  const FORN: PfExport = {
    fonte: "pipefy",
    id: "7007",
    tipo: "table",
    repo: { id: "7007", name: "Parceiros", title_field: { id: "nome" }, table_fields: [campo("nome", "700", "Nome", "short_text"), campo("cidade", "701", "Cidade", "short_text"), campo("email", "702", "E-mail", "email")] },
    automacoes: [],
  };
  const OS: PfExport = {
    fonte: "pipefy",
    id: "8008",
    tipo: "pipe",
    repo: {
      id: "8008",
      name: "Ordens",
      start_form_fields: [
        campo("titulo", "800", "Título", "short_text", { required: true }),
        campo("parceiro", "801", "Parceiro", "connector", { connectedRepo: { id: "7007", name: "Parceiros" }, canConnectMultiples: false }),
        campo("cidade_p", "802", "Cidade do parceiro", "short_text", { required: true }),
        campo("email_p", "803", "E-mail do parceiro", "email", { editable: true }),
      ],
      phases: [{ id: "80", name: "Aberta", index: 0, fields: [] }],
    },
    automacoes: [
      auto("af", "Preencher dados do parceiro", {
        event_repo: { id: "8008" },
        event_params: { triggerFields: [{ id: "parceiro" }] },
        action_repo_v2: { id: "8008" },
        action_params: {
          field_map: [
            { fieldId: "802", inputMode: "copy_from", value: "%{801.701}" },
            { fieldId: "803", inputMode: "copy_from", value: "%{801.702}" },
          ],
        },
      }),
    ],
  };
  const r = converterPipefy([OS, FORN]);
  const f = (k: string) => r.template.boards[0].fields.find((x) => x.key === k);

  it("campo não editável no Pipefy vira espelho (lookup ref); editável vira cópia com aviso", () => {
    expect(validarTemplate(r.template)).toEqual([]);
    expect(f("cidade_do_parceiro")).toMatchObject({ type: "lookup", lookup: { via: "parceiro", path: "cidade", mode: "ref" } });
    expect(f("cidade_do_parceiro")?.required).toBeUndefined();
    expect(f("e_mail_do_parceiro")).toMatchObject({ type: "lookup", lookup: { via: "parceiro", path: "e_mail", mode: "copy" } });
    expect(r.relatorio.boards[0].automacoes[0]).toMatchObject({ destino: "lookup" });
    expect(r.relatorio.boards[0].avisos).toHaveLength(1);
    expect(r.relatorio.boards[0].avisos[0]).toMatch(/E-mail do parceiro.*editável no Pipefy.*cópia/);
    expect(relatorioMarkdown(r.relatorio)).toContain("### Avisos");
  });
});

describe("automações que cabem no motor v1", () => {
  // Pipe de solicitações com filhos (tarefas, pipe) e automações simples.
  const TAREFAS: PfExport = {
    fonte: "pipefy",
    id: "9100",
    tipo: "pipe",
    repo: {
      id: "9100",
      name: "Tarefas",
      start_form_fields: [campo("t_titulo", "910", "Título", "short_text")],
      phases: [
        { id: "91", name: "Aberta", index: 0, fields: [] },
        { id: "92", name: "Feita", index: 1, done: true, fields: [] },
      ],
    },
    automacoes: [],
  };
  const SOL: PfExport = {
    fonte: "pipefy",
    id: "9000",
    tipo: "pipe",
    repo: {
      id: "9000",
      name: "Solicitações",
      start_form_fields: [
        campo("s_titulo", "900", "Título", "short_text"),
        campo("s_status", "901", "Situação", "short_text"),
        campo("s_urgente", "902", "Urgente", "radio_vertical", { options: ["Sim", "Não"] }),
        campo("s_copia", "903", "Cópia do título", "short_text"),
        campo("s_tarefas", "904", "Tarefas", "connector", { connectedRepo: { id: "9100", name: "Tarefas" }, canConnectMultiples: true }),
      ],
      phases: [
        { id: "81", name: "Nova", index: 0, fields: [] },
        { id: "82", name: "Em execução", index: 1, fields: [] },
        { id: "83", name: "Concluída", index: 2, done: true, fields: [] },
      ],
    },
    automacoes: [
      auto("u1", "Marcar situação", {
        event_id: "card_created",
        event_repo: { id: "9000" },
        action_repo_v2: { id: "9000" },
        condition: { expressions: [{ structure_id: "0", field_address: "902", operation: "equals", value: "Sim" }], expressions_structure: [["0"]] },
        action_params: { field_map: [{ fieldId: "901", inputMode: "fixed_value", value: "Prioritária" }, { fieldId: "903", inputMode: "copy_from", value: "%{900}" }] },
      }),
      auto("m1", "Mover urgente", {
        event_id: "field_updated",
        event_repo: { id: "9000" },
        action_id: "move_single_card",
        event_params: { triggerFields: [{ id: "902" }] },
        action_params: { to_phase_id: "82" },
      }),
      auto("f1", "Concluir quando as tarefas acabam", {
        event_id: "all_children_in_phase",
        event_repo: { id: "9100" },
        action_id: "move_parent_card",
        action_repo_v2: { id: "9000" },
        event_params: { to_phase_id: "92" },
        action_params: { to_phase_id: "83" },
      }),
      auto("e1", "Avisar", { event_id: "card_moved", event_repo: { id: "9000" }, action_id: "send_email_template", event_params: { to_phase_id: "82" } }),
      auto("x1", "Texto composto", {
        event_id: "card_created",
        event_repo: { id: "9000" },
        action_repo_v2: { id: "9000" },
        action_params: { field_map: [{ fieldId: "903", inputMode: "copy_from", value: "Cópia: %{900}" }] },
      }),
    ],
  };
  const r = converterPipefy([SOL, TAREFAS]);
  const sol = r.template.boards.find((b) => b.name === "Solicitações")!;
  const conv = (sol.automations ?? []).filter((a) => a.status === "convertida");
  const pend = (sol.automations ?? []).filter((a) => a.status === "pendente");

  it("gatilho, condição e ações viram automação publicada; o template valida", () => {
    expect(validarTemplate(r.template)).toEqual([]);
    expect(conv.map((a) => a.name)).toEqual(["Marcar situação", "Mover urgente", "Concluir quando as tarefas acabam"]);
    expect(conv[0]).toMatchObject({
      env: "published",
      trigger: { type: "card_created" },
      condition: 'card.urgente == "Sim"',
      steps: [
        { type: "set_field", field: "situacao", value: "Prioritária" },
        { type: "set_field", field: "copia_do_titulo", expr: "card.titulo" },
      ],
    });
    expect(conv[1]).toMatchObject({ trigger: { type: "field_updated", fields: ["urgente"] }, steps: [{ type: "move_card", phase: "em_execucao" }] });
    // Todos os filhos na fase → automação do board pai, pela relação
    expect(conv[2]).toMatchObject({ trigger: { type: "all_children_in_phase", relation: "tarefas", phase: "feita" }, steps: [{ type: "move_card", phase: "concluida" }] });
  });

  it("o que não cabe fica pendente com o motivo; relatório conta automações do Plexu", () => {
    expect(pend.map((a) => [a.name, a.note])).toEqual([
      ["Avisar", "e-mail com modelo: o conteúdo do modelo não é exportável via API"],
      ["Texto composto", "valor de Cópia do título mistura texto e campos ou vem de card conectado"],
    ]);
    expect(r.relatorio.totais).toMatchObject({ automacoesV1: 3, pendentes: 2 });
    expect(relatorioMarkdown(r.relatorio)).toContain("3 automações do Plexu");
  });
});
