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
3. Rollup/formula/lookup(ref) só existem em `computed`; o recálculo é **síncrono, na mesma transação da escrita** (em cascata pelos cards dependentes). Cada mudança de `computed` emite `card.field_updated` (`computed: true`) para consumidores externos (webhooks, automações, histórico); o evento não é o gatilho do recálculo.
4. Automações reagem a `events`; nunca são chamadas diretamente.

## core/ (v0.1)

Único caminho de escrita em `cards` e `card_links` (`src/core/cards.ts`). Um teste (`src/core/__tests__/invariantes.test.ts`) falha se houver escrita nessas tabelas fora de `src/core`.

| Módulo | Papel |
|---|---|
| `cards.ts` | `createCard`, `updateFields`, `moveCard`, `linkCards`, `unlinkCards`, `deleteCard` (lógico), `restoreCard`. Transação → regras → escrita → recálculo → eventos → retorno. Com `{ tx }`, roda em savepoint da transação do chamador. Erros de negócio saem como `CoreError` (`codigo`, `ruleId`, `campos`). |
| `rules.ts` | `canCreate`, `canEdit`, `canEnter`, `canLeave`, `canBack`, `canDelete` → `{ ok }` ou `{ ok: false, motivo, ruleId }`. Monta o contexto de `src/lib/expr` com resolver pré-carregado (só o que as expressões referenciam). |
| `fields.ts` | Validação por tipo, `default_value_expr`, `unique_value`, `sequence`, índice de relação exclusiva, recálculo de `rollup` e `dynamic_text`. |
| `events.ts` | `emitirEvento` tipado; `actor_type`/`actor_id` obrigatórios (id só pode faltar para `system`). |
| `meta.ts` | Leitura de configuração e visão do card por slug (uso interno). |

Decisões:
- **Recálculo síncrono** (invariante 3). O valor já volta correto no retorno da operação; o evento de computed serve a quem consome eventos. O card recém-criado não emite eventos de computed; o `card.created` basta.
- **Locks.** Cards são travados com `FOR NO KEY UPDATE`, que não conflita com o `KEY SHARE` que a FK de `card_links` pega no card referenciado. Assim N filhos criados em paralelo serializam no pai sem deadlock, e o rollup do pai vê todos os filhos.
- **`can_leave` só ao avançar.** Avançar avalia obrigatórios da fase de origem e de todas as anteriores, mais regras `can_leave`, mais `can_enter` do destino. Voltar avalia `can_back` e `can_enter`. Criar direto numa fase posterior exige os obrigatórios das fases anteriores.
- **Obrigatório por fase.** `field_phase_settings.required` vence; na ausência, `required_expr` é avaliada com `fase` = aquela fase. Campo invisível na fase não é exigido nela.
- **`can_back.on_fail.children`.** MVP: `block` (padrão) e `keep`. `cancel`/`delete` bloqueiam com mensagem até a v1.
- **Sequence.** Semente = primeiro valor emitido (`seed` padrão 1, `pad` padrão 4). Tokens `{n}`, `{n:4}`, `{ano}`, `{mes}`, `{dia}`, `{pai.<slug>}`. Datas no fuso do workspace (`settings.timezone`). Escopo `parent` exige o pai na criação (relação passada em `props`).
- **Relação exclusiva.** Índice único parcial `card_links_excl_<field>` criado sob lock consultivo na primeira ligação (ou antes, via `garantirIndiceExclusivo` ao configurar o campo). Checagem prévia dá mensagem com o card já ligado; violação do índice vira `relacao_exclusiva`.
- **Exclusão lógica (decisão 17)** não remove `card_links`: marca `card_links.deleted_at` com o mesmo instante do card, e toda leitura de ligação filtra `deleted_at is null`. `restoreCard` reativa as ligações inativadas por aquela exclusão (se a outra ponta estiver excluída, a ligação passa a acompanhar a exclusão dela) e falha com erro claro se reativar violaria exclusividade, cardinalidade ou unicidade. Emite `card.restored`; não há regra `can_restore` no MVP.
- **Relações em `props`.** `createCard`/`updateFields` aceitam o campo de relação com a lista de destinos; o core converte em ligações (diff) com as mesmas checagens de `linkCards`.
- **Configuração dos calculados.** `rollup: { via_field, agg: count|sum|avg|min|max, expr?, filter_expr? }`: `via_field` é o campo de relação (deste board: agrega os destinos; do outro board: agrega as origens). `expr` é um slug do card relacionado ou CEL com `card` = item; `filter_expr` idem, com `pai` = card que agrega. `dynamic_text: { template }` com trechos `{slug}` ou `{expressão CEL}`; erro vira `#ERRO` no texto em vez de bloquear a escrita.

## UI (v0.1)

```
src/app          páginas (server components) e server actions — sem SQL
src/components   componentes client (kanban, card, ui/* no padrão shadcn) — sem SQL
src/server       leituras (consultas.ts), configuração (config.ts), sessão/acesso — única camada da UI que fala com o banco
src/core         escrita em cards (e comentários) — chamado pelas server actions
```

- **Toda server action** começa com `exigirMembro(ws)` (sessão + pertencimento) e revalida que board e card são daquele workspace. Server actions são endpoints públicos: o layout não protege.
- **Sessão**: cookie `plexu_sessao` httpOnly/SameSite=Lax com `{u, v, e}` assinado em HMAC-SHA256 com `APP_SECRET`. `v` = `users.auth.sv`; incrementar invalida sessões. Senha em `users.auth.senha` (bcrypt, custo 12, via `bcryptjs`, sem binário nativo).
- **Primeiro acesso** (`/setup`) só existe com o banco sem usuários; cria owner + workspace sob lock consultivo.
- **Estado dos campos no card** vem de `core.estadoDosCampos`: `field_phase_settings` vence; sem ajuste, `visible_expr`/`required_expr`. Regras `can_edit` são avaliadas ao salvar e voltam como mensagem.
- **Relações no card**: campo próprio com cardinalidade um (ou `is_parent`) vira seletor com busca; campo próprio múltiplo e relações `is_parent` de outros boards viram sub-tabela com criação inline. Criar filho + ligar é atômico (`src/server/cards.ts`, core com `{ tx }`).
- **Configuração** (`src/server/config.ts`) emite `config.changed` na mesma transação.
- Um teste falha se `src/app` ou `src/components` importarem `db`/drizzle.
- **Tabela** (`/table`): TanStack Table v9 (`useTable` + `tableFeatures`) para ordenação; o filtro de texto é local, sobre os valores já formatados (sem acento/caixa, todas as palavras). Boards base abrem direto na tabela.
- **Configurações** (`/settings`, owner/admin): fases (criar, renomear, reordenar, final, arquivar sem cards), campos (tipo e config estruturada por tipo, expressões, título, único, arquivar) com ajuste por fase, e regras (sem exclusão: desativar). `src/lib/config-campos.ts` valida a config por tipo; toda expressão é validada com `parse()` no servidor e, ao digitar, no navegador (mesmo motor), com os avisos do lint.
- **Seed** (`pnpm db:seed`) e **e2e** (`pnpm e2e`, Playwright sobre `next dev`) cobrem o caso de aceitação do MVP; o CI roda os dois depois do build.
- **Navegação (v0.2)**: sidebar fixa com os boards (Fluxos/Bases); cabeçalho do board com views, Configurações e "+ Novo card". Criar card abre o formulário da fase (campos visíveis/editáveis na fase; nunca cria card vazio).
- **Card em painel lateral**: `/c/[id]` renderiza a view do board por baixo (kanban, ou tabela com `?v=tabela`) e o painel por cima; a URL é compartilhável. Rota interceptada (`@slot/(.)c`) foi evitada por bug do Next 15 com slot paralelo em segmento dinâmico.
- **Construtor de condições** (`src/components/condicoes`): modelo de grupos E/OU ↔ CEL. Gera CEL canônico e faz o caminho inverso pela AST do cel-js; o que não cabe no modelo fica só no modo avançado. Usado em regras e em obrigatório/visível de campos; pronto para condições de automação.
- **Cartão do kanban**: `boards.settings.kanban_fields` (até 3) e `kanban_due_field`; responsável vem de `cards.assignees` ou do primeiro campo pessoa.
