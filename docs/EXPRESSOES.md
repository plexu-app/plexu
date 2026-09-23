# Expressões — referência (v0.1)

Regras (`can_enter`, `can_leave`, `can_back`, `can_edit`, `can_delete`), condições de ação/automação, visibilidade e obrigatoriedade de campo, valores padrão e fórmulas usam a mesma linguagem: **CEL** (Common Expression Language), com um contexto em português. Motor em `src/lib/expr.ts`; contrato em `PRODUTO.md` (decisão 15) e `schema.sql` (tabela `rules`).

A implementação usa a biblioteca [`@marcbachmann/cel-js`](https://www.npmjs.com/package/@marcbachmann/cel-js), **fixada em 8.0.0** porque as macros PT-BR e o `has()` tocam detalhes internos dela (`ast.clone`, `ast.setMeta`, `parser.registry.findMacro`); um teste em `expr.test.ts` falha com orientação se esses pontos mudarem. O pacote `cel-js` (ChromeGG) foi descartado porque sua gramática não aceita método após chamada de função (`filhos("x").todos(...)`) nem macros customizadas.

## Contexto

| Nome | Tipo | Descrição |
|---|---|---|
| `card.<slug>` | valor | Campo do card atual (props + computed). Campo ausente lê como `null`, nunca erro. |
| `pai.<slug>` | valor | Card pai (relação `is_parent`). `pai` é `null` quando não há. |
| `filhos(<rel>)` | lista | Cards ligados ao card atual pela relação, lado filhos. |
| `pais(<rel>)` | lista | Idem, lado pais. |
| `cartoes(<board>)` | lista | Cards de um board do workspace (board inteiro em memória; ver limitação abaixo). |
| `existe(<board>, x, cond)` | bool | Algum card do board satisfaz `cond`. Forma curta: `existe(<board>, cond)` usando `item`. |
| `fase`, `fase_origem`, `fase_destino` | string ou null | Fase atual e, em transições, origem e destino. |
| `usuario` | registro | Quem dispara a ação (`usuario.id`, `usuario.email`, ...). |
| `hoje()` | string | Data em `AAAA-MM-DD` no fuso do workspace (`settings.timezone`) quando avaliada pelo core; comparável com campos de data. |

Resolução de `filhos`/`pais`/`pai` a partir das ligações (`card_links`, campo de relação no board de origem):

- Relação com `is_parent`: o card de origem é filho, o de destino é pai. O filho vê `pai` e `pais(<slug do campo>)`; o pai vê `filhos(<inverse_name>)` (ou o slug do campo).
- Relação comum: o card de origem vê os destinos em `filhos(<slug do campo>)`; o destino vê a origem em `pais(<inverse_name>)` (ou o slug).

Registros de card (inclusive itens de listas) trazem os campos por slug e, quando não colidem com um slug, `id`, `titulo`, `fase` (nome) e `status`. Campo de relação lê como a lista de ids ligados a partir do card.

Métodos de lista:

| Método | Resultado |
|---|---|
| `.todos(x, cond)` / `.todos(cond)` | `true` se todos satisfazem (lista vazia → `true`). Sem variável, o elemento é `item`. |
| `.algum(x, cond)` / `.algum(cond)` | `true` se algum satisfaz (lista vazia → `false`). |
| `.contar()` | quantidade de elementos |
| `.soma(<slug>)` | soma numérica do campo; `null`/não numérico contam 0 |

As macros padrão do CEL continuam disponíveis e compõem com as acima: `filter`, `map`, `exists`, `all`, `size`, `in`, ternário `? :`. Campo ausente lê como `null`; `has(card.x)` diz se a chave existe em props/computed (valor `null` presente conta como presente; chave com `undefined` conta como ausente).

## Exemplos

```cel
// can_enter(elaboração): todas as parcelas medidas
filhos("parcelas").todos(p, p.data_medicao != null)

// can_back: filho bloqueia o pai
!filhos("versoes").algum(v, v.fase == "assinado")

// visibilidade condicional
card.tipo == "servico" && pai.valor > 10000

// aprovação só acima de valor
card.valor >= 50000 && usuario.id != card.solicitante

// duplicidade em cadastro
!existe("parceiros", p, p.cnpj == card.cnpj)

// prazo vencido
hoje() > card.prazo

// fórmula
filhos("parcelas").soma("valor") - filhos("parcelas").filter(p, p.pago).soma("valor")
```

Sim/não em obrigatório/visível (decisão 11) são as expressões constantes `true` e `false`.

## Limitação MVP: existe() e cartoes() carregam o board inteiro

O resolver entrega `cartoes(board)` como lista completa em memória, e `existe(board, x, cond)` percorre essa lista; a condição **não** vira consulta SQL. Para boards pequenos (cadastros, bases) é adequado. Para boards grandes, o chamador deve pré-filtrar no resolver (por exemplo, só cards ativos) ou evitar `existe()` em regras avaliadas com frequência. Traduzir `cond` para SQL fica para depois do MVP.

## Limites estruturais

`parse`/`compile` recusam com `ExprError` (`codigo: "sintaxe"`, mensagem `expressão excede o limite de <nome> (<valor>)`) expressões acima dos limites em `LIMITES`: caracteres (20 000), profundidade de aninhamento (40), nós (2 000), elementos de lista (500), entradas de mapa (200) e argumentos por chamada (16).

## Tipos e aritmética

Números vindos do JSON são `double`; literais inteiros são `int`. O motor registra `double ∘ int` e `int ∘ double` para `+ - * / %`, então `card.valor * 2` funciona. Comparações entre tipos numéricos já são nativas do CEL. Datas são strings ISO (`AAAA-MM-DD` ou timestamp), comparáveis lexicograficamente.

## API (`src/lib/expr.ts`)

```ts
compile(fonte): ExprCompilada       // lança ExprError (codigo: sintaxe | tipo)
  .evaluate(ctx): unknown           // inteiros CEL viram number; registros viram objetos
  .evaluateBool(ctx): boolean       // exige booleano (regras/condições)
  .referencias                      // { card, pai, filhos, pais, boards, globais }
  .avisos                           // lint

parse(fonte): { ok: true, referencias, avisos } | { ok: false, erro: { codigo, mensagem, posicao } }
lint(fonte): Aviso[]
evaluate(fonte, ctx) / evaluateBool(fonte, ctx)   // atalhos
```

Contexto (`ExprContext`): `card`, `pai?`, `fase?`, `fase_origem?`, `fase_destino?`, `usuario?`, `hoje?` (string ou `Date`, para testes/determinismo) e `resolver?` com `filhos(rel)`, `pais(rel)`, `cartoes(board)`. O motor **não acessa banco**: o chamador carrega os dados e injeta o resolver. `referencias` diz o que carregar antes de avaliar.

## Lint

`parse`/`compile` devolvem avisos sobre cadeias de `||` e `&&`:

| Tipo | Exemplo |
|---|---|
| `tautologia` | `card.a != 10 \|\| card.a != 20`, `card.x \|\| !card.x`, `true \|\| ...` |
| `contradicao` | `card.a == 10 && card.a == 20`, `card.a > 10 && card.a < 5`, `false && ...` |
| `redundancia` | `card.a > 5 && card.a > 3`, operando repetido, `true && ...` |
| `referencia_dinamica` | `filhos(card.rel)`: dependência não rastreável |

A análise é local a cada par de comparações sobre a mesma expressão com constante; não faz prova geral.
