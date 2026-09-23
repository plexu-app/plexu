# Arquitetura (MVP)

```
browser ──▶ Next.js (App Router)
              ├─ route handlers  /api/v1/*   ← REST público (OpenAPI)
              ├─ server actions              ← UI interna
              └─ core/
                   ├─ rules      can_enter / can_leave / can_back / can_edit   (CEL)
                   ├─ fields     tipos, validação, sequence, rollup, dynamic_text
                   ├─ cards      create / update / move / link  → sempre via core, nunca SQL direto
                   ├─ events     append-only; todo write do core emite evento
                   └─ automations trigger → condition → steps (mesmos steps das Ações)
                         │
                         ▼
              pg-boss (fila em Postgres) ──▶ worker (src/worker) executa steps assíncronos
                                                                     │
PostgreSQL ◀─────────────────────────────────────────────────────────┘
  props jsonb (digitado) · computed jsonb (calculado) · events (imutável)
```

Invariantes:
1. Nenhum canal (UI, API, import, automação) escreve em `cards` sem passar por `core/cards`.
2. `core/cards` avalia regras **antes** de gravar e emite `events` **na mesma transação**.
3. Rollup/formula/lookup(ref) só existem em `computed`; recálculo é disparado por evento.
4. Automações reagem a `events`; nunca são chamadas diretamente.

## core/ (v0.1)

Único caminho de escrita em `cards` e `card_links` (`src/core/cards.ts`). Um teste (`src/core/__tests__/invariantes.test.ts`) falha se houver escrita nessas tabelas fora de `src/core`.

| Módulo | Papel |
|---|---|
| `cards.ts` | `createCard`, `updateFields`, `moveCard`, `linkCards`, `unlinkCards`, `deleteCard` (lógico). Transação → regras → escrita → recálculo → eventos → retorno. Com `{ tx }`, roda em savepoint da transação do chamador. Erros de negócio saem como `CoreError` (`codigo`, `ruleId`, `campos`). |
| `rules.ts` | `canCreate`, `canEdit`, `canEnter`, `canLeave`, `canBack`, `canDelete` → `{ ok }` ou `{ ok: false, motivo, ruleId }`. Monta o contexto de `src/lib/expr` com resolver pré-carregado (só o que as expressões referenciam). |
| `fields.ts` | Validação por tipo, `default_value_expr`, `unique_value`, `sequence`, índice de relação exclusiva, recálculo de `rollup` e `dynamic_text`. |
| `events.ts` | `emitirEvento` tipado; `actor_type`/`actor_id` obrigatórios (id só pode faltar para `system`). |
| `meta.ts` | Leitura de configuração e visão do card por slug (uso interno). |

Decisões:
- **Recálculo síncrono.** `computed` é recalculado na mesma transação da escrita, em cascata (pai com rollup, filho com texto que lê o pai), e cada mudança emite `card.field_updated` com `computed: true`. Isso antecipa a invariante 3 ("disparado por evento"): o evento continua sendo emitido, mas o valor já está correto no retorno. O card recém-criado não emite eventos de computed; o `card.created` basta.
- **Locks.** Cards são travados com `FOR NO KEY UPDATE`, que não conflita com o `KEY SHARE` que a FK de `card_links` pega no card referenciado. Assim N filhos criados em paralelo serializam no pai sem deadlock, e o rollup do pai vê todos os filhos.
- **`can_leave` só ao avançar.** Avançar avalia obrigatórios da fase de origem e de todas as anteriores, mais regras `can_leave`, mais `can_enter` do destino. Voltar avalia `can_back` e `can_enter`. Criar direto numa fase posterior exige os obrigatórios das fases anteriores.
- **Obrigatório por fase.** `field_phase_settings.required` vence; na ausência, `required_expr` é avaliada com `fase` = aquela fase. Campo invisível na fase não é exigido nela.
- **`can_back.on_fail.children`.** MVP: `block` (padrão) e `keep`. `cancel`/`delete` bloqueiam com mensagem até a v1.
- **Sequence.** Semente = primeiro valor emitido (`seed` padrão 1, `pad` padrão 4). Tokens `{n}`, `{n:4}`, `{ano}`, `{mes}`, `{dia}`, `{pai.<slug>}`. Datas no fuso do workspace (`settings.timezone`). Escopo `parent` exige o pai na criação (relação passada em `props`).
- **Relação exclusiva.** Índice único parcial `card_links_excl_<field>` criado sob lock consultivo na primeira ligação (ou antes, via `garantirIndiceExclusivo` ao configurar o campo). Checagem prévia dá mensagem com o card já ligado; violação do índice vira `relacao_exclusiva`.
- **Exclusão lógica** remove as ligações do card (com `card.link_removed`, `motivo: card_deleted`), para não bloquear relações exclusivas nem contar em rollups.
- **Relações em `props`.** `createCard`/`updateFields` aceitam o campo de relação com a lista de destinos; o core converte em ligações (diff) com as mesmas checagens de `linkCards`.
- **Configuração dos calculados.** `rollup: { via_field, agg: count|sum|avg|min|max, expr?, filter_expr? }`: `via_field` é o campo de relação (deste board: agrega os destinos; do outro board: agrega as origens). `expr` é um slug do card relacionado ou CEL com `card` = item; `filter_expr` idem, com `pai` = card que agrega. `dynamic_text: { template }` com trechos `{slug}` ou `{expressão CEL}`; erro vira `#ERRO` no texto em vez de bloquear a escrita.
