# Templates do Plexu

Um template é a **configuração** de um ou mais boards em JSON: fases, campos, relações, regras e o lugar reservado para automações. Nunca contém cards. É o formato previsto no PRODUTO para templates por área, snapshots e versionamento da configuração (seções 3 e 8), e é o alvo dos importadores de outras ferramentas.

Código: `src/lib/template.ts` (tipos e validação), `src/db/template.ts` (import/export no banco).

## Comandos

```bash
pnpm template:export <board> [<board>...] [--workspace slug] [--saida arquivo.json]
pnpm template:import <arquivo.json> [--workspace "Nome"] [--membro email@exemplo]
```

- `template:export`: padrão `--workspace demo`, saída no terminal. Exporte juntos os boards ligados por relações e rollups; relação para um board fora da lista sai com o slug dele.
- `template:import`: cria o workspace se não existir (padrão: nome do template). `--membro` adiciona um usuário existente como owner. Valida tudo antes de gravar; se algo falhar, nada é gravado. Cada entidade criada emite `config.changed` (decisão 13). Automações do template não são criadas (ainda não há motor): o comando só as conta.
- Ambos usam `DATABASE_URL` (padrão: banco do demo, `plexu`).

## Formato

```jsonc
{
  "plexu_template": 1,
  "name": "Compras",
  "description": "opcional",
  "boards": [
    {
      "key": "pedidos",                 // vira o slug do board (minúsculas, dígitos, _ ou -)
      "name": "Pedidos",
      "kind": "workflow",               // ou "database" (sem fases)
      "title_field": "numero",          // key de um campo
      "phases": [
        { "key": "abertura", "name": "Abertura" },
        { "key": "entregue", "name": "Entregue", "terminal": true, "color": "#0e9f6e" }
      ],
      "fields": [ /* ver abaixo */ ],
      "rules": [
        { "kind": "can_leave", "phase": "abertura", "expr": "filhos(\"itens\").contar() > 0", "message": "Inclua ao menos um item." }
      ],
      "automations": [ /* reservado: ver abaixo */ ]
    }
  ]
}
```

Tudo é referenciado por `key`, nunca por UUID. A key de campo é o identificador nas expressões (`card.<key>`), então segue as regras de identificador CEL: minúsculas, dígitos e `_`, sem começar com dígito.

### Campos

| Propriedade | Uso |
|---|---|
| `key`, `name`, `type` | `type`: `text`, `long_text`, `number`, `currency`, `date`, `datetime`, `boolean`, `select`, `multi_select`, `person`, `cpf`, `cnpj`, `attachment`, `relation`, `sequence`, `rollup`, `dynamic_text` |
| `help` | texto de ajuda |
| `required`, `visible`, `default` | expressões CEL (`"true"` = sempre obrigatório). Ver `docs/EXPRESSOES.md` |
| `unique` | valor único no board |
| `fill_phases`, `editable_everywhere` | decisão 18-revisada: keys das fases onde o campo é preenchido; editável em qualquer fase depois da primeira |
| `options` | `select` / `multi_select` |
| `currency` | `{ "code": "BRL" }` |
| `multiple` | `person` com várias pessoas |
| `relation` | `{ "board", "cardinality": "one"\|"many", "exclusive", "is_parent", "inverse_name", "filter" }`. `board` é a key de um board do template ou o slug de um board que já existe no workspace de destino |
| `sequence` | `{ "pattern": "PC-{n}", "scope": "global"\|"year"\|"month"\|"day"\|"parent", "seed", "pad", "parent_field" }` |
| `rollup` | `{ "via", "agg": "count"\|"sum"\|"avg"\|"min"\|"max", "expr", "filter", "format": "currency" }`. `via` é a key de uma relação deste board ou `"<board>.<campo>"` para uma relação de outro board que aponta para este |
| `dynamic_text` | `{ "template": "{numero} · {card.global - card.pago}" }` |
| `phase_settings` | exceções por fase: `[{ "phase", "visible", "editable", "required" }]` (`null` = sem exceção) |

### Automações (reservado)

O Plexu ainda não executa automações. O template guarda as que não têm equivalente em regra, rollup ou texto calculado, para revisão e para o futuro motor (decisão 7):

```json
{ "key": "a1", "name": "Avisar comprador", "status": "pendente",
  "trigger": { "event": "card_created", "phase": null, "fields": [] },
  "condition": "card.urgente == true",
  "actions": [{ "type": "send_email_template", "params": {} }],
  "note": "opcional" }
```

## Importar do Pipefy

Três passos, todos só com a API GraphQL (sem navegador) e só estrutura (nunca cards):

```bash
pnpm pipefy:export <id> [<id>...]                         # → exports/pipefy/<id>.json (token em PIPEFY_TOKEN)
pnpm pipefy:to-template exports/pipefy/*.json [--anonimizar] [--nome "…"]
                                                          # → exports/pipefy/template.json e relatorio.md
pnpm template:import exports/pipefy/template.json --workspace "Nome" --membro voce@exemplo
```

`exports/` está no `.gitignore`: exports, templates gerados e relatórios contêm a configuração de quem exportou e **nunca** vão para o repositório. Converta juntos os pipes/databases conectados entre si; conexão para fora do conjunto não vira relação (fica no relatório).

### O que o export traz

Fases (ordem, final, destinos permitidos), campos (tipo, obrigatório, editável em outras fases, opções, ajuda, conexão com o pipe/database alvo e se aceita um ou vários cards), start form, condicionais de campo, automações (gatilho, parâmetros do gatilho, condição, ação e mapa de campos) e webhooks (nome e eventos). De automações HTTP sai só o host da URL: cabeçalhos, corpo e credenciais ficam de fora.

**Não exportável via API** (ou não coberto pelo export): as operações internas de automações de fórmula além do mapa de campos; automações de databases (o export só as consulta para pipes). Cada export registra isso em `nao_exportavel`.

### Mapeamentos

| Pipefy | Plexu |
|---|---|
| `short_text`, `email`, `phone`, `time` | `text` (e-mail/telefone sem validação de formato) |
| `long_text` | `long_text` |
| `number`, `currency` | `number`, `currency` (BRL) |
| `date`; `datetime`, `due_date` | `date`; `datetime` |
| `select`, `radio_*` | `select` |
| `checklist_*`, `label_select` | `multi_select` (etiquetas do pipe viram opções) |
| `assignee_select` | `person` |
| `attachment`, `cpf`, `cnpj` | iguais |
| `id` | `sequence` `{n}` |
| `statement` | ignorado (texto fixo do formulário) |
| `connector` | `relation`; "1 card" → `cardinality: one`. O conversor nunca marca `exclusive`: exclusividade só por opção explícita no template |
| campo na fase X; "editável em outras fases"; obrigatório | `fill_phases: [X]`; `editable_everywhere`; `required: "true"` (vale para sair da fase) |
| start form | campos da primeira fase |
| fase "final" | `terminal` |
| destinos permitidos restritos | regra `can_enter` com `fase_origem`/`fase_destino` |
| conexão com "filho obrigatório para finalizar" | regra `can_enter` nas fases finais: `filhos(rel).contar() > 0` |
| condicional de campo (mostrar/ocultar) | `visible` do campo alvo: mostrar quando = condição; ocultar quando = negação |
| série de conexões numeradas para o mesmo alvo ("Item 01..12") | **uma** relação 1:N (`many`) |
| série de campos numerados alinhada a ela ("Aprovar item 01..12") | um campo em cada card filho; se uma automação copiava cada membro para um campo do filho, esse campo é reaproveitado e a cópia deixa de existir |
| automação `run_a_formula` `SUM(%{item_NN.valor}...)` sobre a série | `rollup` `sum` pela relação (várias automações 1/12…12/12 → 1 rollup) |
| `run_a_formula` entre campos do mesmo card (`SUBTRACT`, `SUM`, …) | `dynamic_text` com a expressão |
| `move_single_card` ao entrar na fase P, se condição, de volta para fase anterior | regra `can_enter(P) := !(condição)`; a mesma condição em várias fases vira **uma** regra |
| demais automações | `automations` com `status: "pendente"`; séries numeradas iguais viram uma só |

Condições do Pipefy viram CEL: OU entre grupos de `expressions_structure`, E dentro do grupo; `blank`/`present` → `== null`/`!= null`; `equals`/`not_equals` (em seleção múltipla, `in`); comparações numéricas; `contains`/`not_contains`; `current_phase` → `fase`; campo de um card conectado (`conexao.campo`) → `filhos("rel").algum(p, …)` (na série, generaliza o item NN para todos os filhos; o relatório avisa).

A API também lista uma automação no pipe onde ela age, além do pipe do gatilho: o conversor conta cada uma uma vez, no pipe do gatilho.

### `--anonimizar`

Troca nomes de pipes (`Board A`), fases, campos, opções, etiquetas, condicionais e automações por genéricos, remove ajudas e textos fixos, e preserva a estrutura (séries, referências, valores de condição mapeados para as opções anônimas). Útil para compartilhar um relatório ou um caso de teste sem expor a configuração original.

### Relatório

`relatorio.md` traz, por objeto: campos originais × campos Plexu; automações originais × destino (regra, rollup, texto calculado, absorvida, pendente) com gatilho, condição e ação; conexões; condicionais convertidas; o que não pôde ser representado e por quê; e o total "N automações no Pipefy → M regras/rollups + K automações pendentes no Plexu".
