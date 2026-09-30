# Templates do Plexu

Um template é a **configuração** de um ou mais boards em JSON: fases, campos, relações, regras e o lugar reservado para automações. Nunca contém cards. É o formato previsto no PRODUTO para templates por área, snapshots e versionamento da configuração (seções 3 e 8), e é o alvo dos importadores de outras ferramentas.

Código: `src/lib/template.ts` (tipos e validação), `src/db/template.ts` (import/export no banco).

## Comandos

```bash
pnpm template:export <board> [<board>...] [--workspace slug] [--saida arquivo.json]
pnpm template:import <arquivo.json> [--workspace "Nome"] [--membro email@exemplo]
```

- `template:export`: padrão `--workspace demo`, saída no terminal. Exporte juntos os boards ligados por relações e rollups; relação para um board fora da lista sai com o slug dele.
- `template:import`: cria o workspace se não existir (padrão: nome do template). `--membro` adiciona um usuário existente como owner. Valida tudo antes de gravar; se algo falhar, nada é gravado. Cada entidade criada emite `config.changed` (decisão 13). Automações `convertida` são criadas (no ambiente do template, padrão rascunho); as `pendente` só são contadas.
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
| `validation` | formato de campos de texto: `{ "regex", "message", "description" }`. Validado no formulário (mensagem abaixo do campo) e no servidor; sem `message`, aparece "Formato inválido. Esperado: <description ou regex>" |
| `fill_phases`, `editable_everywhere` | decisão 18-revisada: keys das fases onde o campo é preenchido; editável em qualquer fase depois da primeira |
| `options` | `select` / `multi_select` |
| `currency` | `{ "code": "BRL" }` |
| `multiple` | `person` com várias pessoas |
| `accept` | `attachment`: extensões/tipos aceitos, como o atributo accept do HTML (`".pdf,.docx,image/*"`); vazio aceita qualquer arquivo |
| `relation` | `{ "board", "cardinality": "one"\|"many", "exclusive", "is_parent", "inverse_name", "filter" }`. `board` é a key de um board do template ou o slug de um board que já existe no workspace de destino |
| `sequence` | `{ "pattern": "PC-{n}", "scope": "global"\|"year"\|"month"\|"day"\|"parent", "seed", "pad", "parent_field" }` |
| `rollup` | `{ "via", "agg": "count"\|"sum"\|"avg"\|"min"\|"max", "expr", "filter", "format": "currency" }`. `via` é a key de uma relação deste board ou `"<board>.<campo>"` para uma relação de outro board que aponta para este |
| `dynamic_text` | `{ "template": "{numero} · {card.global - card.pago}" }` |
| `lookup` | valor de card relacionado: `{ "via", "path", "mode": "ref"|"copy" }`. `via` como em `rollup`; `path` é o identificador de um campo no card ligado (ou `titulo`, `fase`, `status`). `ref` acompanha o card ligado; `copy` grava o valor quando a ligação é criada ou trocada. `"editable_writeback": true` (só com `ref`) torna o espelho editável: editar grava no card de origem pelo core, com as regras `can_edit` de lá, e todos os espelhos acompanham; fica somente leitura se não houver exatamente um card de origem ligado ou se a origem não puder ser editada. Um card ligado → valor; vários → lista. Pode ser o título do board |
| `phase_settings` | exceções por fase: `[{ "phase", "visible", "editable", "required" }]` (`null` = sem exceção) |

### Automações

`"status": "convertida"`: automação do motor v1 (formato de `src/lib/automacoes.ts`, ver ARQUITETURA → Automações), com keys no lugar de ids. O importador cria a automação; o exportador a devolve igual.

```json
{ "key": "a1", "name": "Frete para urgentes", "status": "convertida", "env": "published",
  "trigger": { "type": "card_entered_phase", "phase": "aprovacao" },
  "condition": "card.urgente == true",
  "steps": [
    { "type": "set_field", "field": "motivo", "value": "urgente aprovado" },
    { "type": "create_related_card", "board": "itens", "relation": "itens", "phase": null, "fields": { "descricao": "\"Frete\"" } }
  ],
  "suppress_triggers": false }
```

- `env`: `draft` (padrão, não dispara), `test` ou `published`.
- Fases e campos são keys deste board; relações como em `rollup.via` (`"campo"` ou `"board.campo"`). Em `all_children_in_phase`, `phase` é do board dos filhos; em `create_related_card`, `board`, `phase` e as chaves de `fields` são do board do novo card (valores em CEL sobre o card do gatilho); com `target` pai/filhos (`{ "type": "parent"|"children", "relation": "<via>" }`), `phase`/`field` são do board do card alvo.

`"status": "pendente"`: sem equivalente ainda; o importador só conta.

```json
{ "key": "p1", "name": "Avisar comprador", "status": "pendente",
  "trigger": { "event": "card_created", "phase": null, "fields": [] },
  "condition": "card.urgente == true",
  "actions": [{ "type": "send_email_template", "params": {} }],
  "note": "e-mail com modelo: o conteúdo do modelo não é exportável via API" }
```

## Importar do Pipefy

Três passos, todos só com a API GraphQL (sem navegador) e só estrutura (nunca cards):

```bash
pnpm pipefy:export <id> [<id>...]                         # → exports/pipefy/<id>.json (token em PIPEFY_TOKEN)
pnpm pipefy:export <id-da-base> --registros                # database de apoio: também id e título dos registros
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
| `attachment` | `attachment`; as extensões em `custom_validation` viram `accept` |
| `cpf`, `cnpj` | iguais |
| `id` | `sequence` `{n}` |
| `statement` | ignorado (texto fixo do formulário) |
| `connector` | `relation`; "1 card" → `cardinality: one`. O conversor nunca marca `exclusive`: exclusividade só por opção explícita no template |
| campo na fase X; "editável em outras fases"; obrigatório | `fill_phases: [X]`; `editable_everywhere`; `required: "true"` (vale para sair da fase) |
| regex de validação (`custom_validation`) em campo de texto | `validation.regex` (âncoras `\A`/`\z` viram `^`/`$`) com o texto de ajuda como `validation.message`; regex que não compila em JavaScript vai para "Não representado" |
| título do pipe | `title_field`: o campo marcado como título; senão o primeiro texto obrigatório; senão o primeiro texto |
| start form | campos da primeira fase |
| fase "final" | `terminal` |
| destinos permitidos restritos | regra `can_enter` com `fase_origem`/`fase_destino` |
| conexão com "filho obrigatório para finalizar" | regra `can_enter` nas fases finais: `filhos(rel).contar() > 0` |
| condicional de campo (mostrar/ocultar) | `visible` do campo alvo: mostrar quando = condição; ocultar quando = negação |
| condição sobre conexão com uma base de apoio ("Categoria = registro X") | com a base exportada com `--registros`: `filhos("conexao").algum(r, r.titulo == "<título do registro>")` (vários registros → `in [...]`; diferente → negação; vazio/preenchido → `size(card.conexao)`); registro não exportado fica em "Não convertida" com o motivo |
| série de conexões numeradas para o mesmo alvo ("Item 01..12") | **uma** relação 1:N (`many`) |
| série de campos numerados alinhada a ela ("Aprovar item 01..12") | um campo em cada card filho; se uma automação copiava cada membro para um campo do filho, esse campo é reaproveitado e a cópia deixa de existir |
| automação `run_a_formula` `SUM(%{item_NN.valor}...)` sobre a série | `rollup` `sum` pela relação (várias automações 1/12…12/12 → 1 rollup) |
| `run_a_formula` entre campos do mesmo card (`SUBTRACT`, `SUM`, …) | `dynamic_text` com a expressão |
| `move_single_card` ao entrar na fase P, se condição, de volta para fase anterior | regra `can_enter(P) := !(condição)`; a mesma condição em várias fases vira **uma** regra |
| título do card = conexão | campo `lookup` (`ref`, `path: "titulo"`) pela conexão, usado como título |
| `update_card_field` no filho da série copiando um campo simples do pai | o campo do filho vira `lookup` `ref` pela relação da série (a série de automações deixa de existir) |
| automação que cabe no motor v1: gatilho `card_created`, `card_moved` (entrou na fase), `card_left_phase`, `field_updated` (campos simples) com ação `update_card_field` no próprio card (valor fixo, vazio ou cópia de um campo), `move_single_card`, `move_parent_card` (`move_card` com `target` pai pela conexão do board pai), `create_card`/`create_connected_card` (board do conjunto; conexão pela única relação entre os boards); `all_children_in_phase` + `move_parent_card` | `automations` com `status: "convertida"` (publicada se ativa no Pipefy; rascunho se inativa); a de filhos vai para o board pai |
| demais automações | `automations` com `status: "pendente"` e o motivo em `note` (e-mail com modelo e HTTP: conteúdo não exportável; ação em outro card; texto misturado com campos; condição não convertida); séries numeradas iguais viram uma só |

Condições do Pipefy viram CEL: OU entre grupos de `expressions_structure`, E dentro do grupo; `blank`/`present` → `== null`/`!= null`; `equals`/`not_equals` (em seleção múltipla, `in`); comparações numéricas; `contains`/`not_contains`; `current_phase` → `fase`; campo de um card conectado (`conexao.campo`) → `filhos("rel").algum(p, …)` (na série, generaliza o item NN para todos os filhos; o relatório avisa).

A API também lista uma automação no pipe onde ela age, além do pipe do gatilho: o conversor conta cada uma uma vez, no pipe do gatilho.

### `--anonimizar`

Troca nomes de pipes (`Board A`), fases, campos, opções, etiquetas, condicionais e automações por genéricos, remove ajudas e textos fixos, e preserva a estrutura (séries, referências, valores de condição mapeados para as opções anônimas). Útil para compartilhar um relatório ou um caso de teste sem expor a configuração original.

### Relatório

`relatorio.md` traz, por objeto: campos originais × campos Plexu; automações originais × destino (regra, rollup, texto calculado, absorvida, pendente) com gatilho, condição e ação; conexões; condicionais convertidas; o que não pôde ser representado e por quê; e o total "N automações no Pipefy → M regras/rollups + K automações pendentes no Plexu".
