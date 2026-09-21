-- schema.sql v0.1 — modelo de dados núcleo
-- Convenções:
--   * todo registro tem id uuid, workspace_id (tenant), created_at/updated_at; RLS por workspace_id.
--   * configuração em jsonb onde a forma varia por tipo; dados de negócio em colunas quando indexáveis.
--   * expressões (regras, condições, visibilidade, fórmulas) são strings CEL avaliadas no servidor.
--   * nada é apagado fisicamente em objetos de configuração: archived_at.

create extension if not exists pgcrypto;

-- =========================================================
-- 1. TENANT, IDENTIDADE, PERMISSÃO
-- =========================================================
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  settings jsonb not null default '{}',          -- locale, timezone, calendário padrão
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext unique not null,
  name text not null,
  auth jsonb not null default '{}',              -- hash/oidc/sso
  created_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid references workspaces,
  user_id uuid references users,
  org_role text not null check (org_role in ('owner','admin','member','guest')),
  primary key (workspace_id, user_id)
);

create table groups (                            -- grupos = sujeito de permissão e de atribuição
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  name text not null,
  unique (workspace_id, name)
);
create table group_members (
  group_id uuid references groups on delete cascade,
  user_id uuid references users,
  primary key (group_id, user_id)
);

create table roles (                             -- papéis custom por workspace (presets: admin, member, own_cards, reader)
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  name text not null,
  is_preset bool not null default false,
  unique (workspace_id, name)
);

-- Permissão = (sujeito) pode (ação) em (recurso). Recurso pode ser board, fase, campo, ação.
create table permissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  subject_type text not null check (subject_type in ('user','group','role')),
  subject_id uuid not null,
  resource_type text not null check (resource_type in ('workspace','board','phase','field','action','view','form')),
  resource_id uuid not null,
  permission text not null,                       -- board.read, board.configure, card.create, card.edit, card.delete, card.move, field.read, field.write, action.run, ...
  condition text,                                 -- CEL opcional: "card.assignee == user.id"
  unique (subject_type, subject_id, resource_type, resource_id, permission)
);

-- =========================================================
-- 2. BOARD, FASE, CAMPO
-- =========================================================
create table boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  kind text not null default 'workflow' check (kind in ('workflow','database')),
  name text not null,
  slug text not null,
  icon text,
  title_field_id uuid,                            -- campo usado como título de exibição (FK adicionada abaixo)
  settings jsonb not null default '{}',           -- visibilidade default, expiração, e-mail de entrada, calendário, features ligadas (phases, dates, approvals...)
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table phases (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards on delete cascade,
  name text not null,
  position int not null,
  color text,
  is_terminal bool not null default false,        -- N fases finais por board
  allow_create bool not null default false,       -- pode criar card direto nesta fase
  assignee_expr text,                             -- CEL → user/group (responsável automático/condicional)
  sla jsonb,                                      -- {duration, unit, business_days, alert_at, escalate_to}
  settings jsonb not null default '{}',
  archived_at timestamptz,
  unique (board_id, position)
);

-- Tipos: text, long_text, statement, number, currency, date, datetime, due_date, time, boolean,
--        select, multi_select, radio, checklist, person, email, phone, cpf, cnpj, cep, attachment,
--        relation, lookup, sequence, rollup, formula, dynamic_text, tag, url, id
-- dynamic_text: modelo de texto com trechos calculados escolhidos visualmente ({numero}, {global - pago}); somente leitura, recalculado como formula.
create table fields (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards on delete cascade,
  type text not null,
  name text not null,
  slug text not null,                             -- alias opcional para API; id é a identidade
  description text,
  help_text text,
  required_expr text,                             -- CEL; null = nunca; 'true' = sempre; "props.a == null" etc.
  visible_expr text,                              -- CEL; null = sempre visível
  unique_value bool not null default false,
  default_value_expr text,                        -- CEL avaliada na criação
  validation jsonb,                               -- {regex, min, max, mask}
  config jsonb not null default '{}',             -- por tipo: options[], relation{target_board,cardinality,exclusive,filter_expr,inverse_name,is_parent,on_parent_back,lock_fields_while_linked[]}, lookup{via_field,path,mode:'copy'|'ref'}, sequence{scope,pattern,seed,reset}, rollup{via_field,agg,expr,filter_expr}, formula{expr}, currency{code}
  position int not null default 0,
  archived_at timestamptz,
  unique (board_id, slug)
);
alter table boards add foreign key (title_field_id) references fields deferrable initially deferred;

-- Comportamento do campo por fase (só workflow). Ausência = herda default do campo.
create table field_phase_settings (
  field_id uuid references fields on delete cascade,
  phase_id uuid references phases on delete cascade,
  visible bool,
  editable bool,
  required bool,
  position int,
  primary key (field_id, phase_id)
);

-- =========================================================
-- 3. CARDS E RELAÇÕES
-- =========================================================
create table cards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  board_id uuid not null references boards,
  phase_id uuid references phases,                -- null em database
  title text not null default '',                 -- cache do title_field
  props jsonb not null default '{}',              -- {field_id: value}; rollup/formula/lookup(ref) NÃO persistidos aqui
  computed jsonb not null default '{}',           -- cache de rollup/formula/lookup(ref), recalculado por trigger
  assignees uuid[] not null default '{}',
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','done','canceled')),  -- done = fase terminal ou concluído em database
  created_by uuid references users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  phase_entered_at timestamptz,
  deleted_at timestamptz
);
create index on cards (board_id, phase_id) where deleted_at is null;
create index on cards using gin (props jsonb_path_ops);

-- Toda relação é um campo do tipo relation. Bidirecional por construção (consultar pelos dois lados).
create table card_links (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields,       -- campo de relação no board de origem
  from_card_id uuid not null references cards on delete cascade,
  to_card_id uuid not null references cards on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (field_id, from_card_id, to_card_id)
);
create index on card_links (to_card_id);
-- exclusive=true: índice único parcial (field_id, to_card_id) criado ao configurar a relação → card só selecionável em um card daquela conexão.
-- lock_fields_while_linked: campos do card de origem ficam somente-leitura enquanto existir link neste campo (cadeia solicitação → cotação → OC desfaz-se de trás pra frente).

-- Contadores atômicos. scope_key = '' (global do board) | to_card_id do pai | '2026' | '2026-09' | '2026-09-21'.
-- fields.config.sequence = {pattern, scope:'global'|'year'|'month'|'day'|'parent', parent_field?, seed:1, pad:4}
-- Exemplos:
--   contrato : {pattern:'CT-{n}/{ano}',        scope:'year'}                        → CT-0001/2026 (reinicia em 2027)
--   versão   : {pattern:'{pai.numero}-v{n}',    scope:'parent', parent_field:<rel>}  → CT-0001/2026-v3
--   parcela  : {pattern:'{pai.numero}/{n}',     scope:'parent', parent_field:<rel>, pad:2} → CT-0001/2026/04
--   proposta : {pattern:'P{n}',                 scope:'global', seed:6572, pad:0}   → P6573
-- Atribuído no INSERT dentro da transação (SELECT ... FOR UPDATE em sequences). Nunca reutilizado, nunca editável.
create table sequences (
  field_id uuid references fields on delete cascade,
  scope_key text not null default '',
  last_value bigint not null default 0,
  primary key (field_id, scope_key)
);

create table card_comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards on delete cascade,
  parent_id uuid references card_comments,        -- thread
  author_id uuid references users,
  body text not null,
  source text not null default 'user' check (source in ('user','email','automation','system')),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  card_id uuid references cards on delete cascade,
  field_id uuid references fields,
  comment_id uuid references card_comments,
  storage_key text not null,
  filename text not null,
  mime text,
  size bigint,
  uploaded_by uuid references users,
  created_at timestamptz not null default now()
);

create table tasks (                             -- tarefa leve dentro do card (checklist com dono e prazo)
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards on delete cascade,
  phase_id uuid references phases,
  title text not null,
  assignee_id uuid references users,
  due_at timestamptz,
  done_at timestamptz,
  position int not null default 0
);

create table tag_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  name text not null,
  unique (workspace_id, name)
);
create table tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  category_id uuid references tag_categories,
  name text not null,
  color text,
  visible_boards uuid[],                          -- null = todos
  unique (workspace_id, category_id, name)
);
create table card_tags (
  card_id uuid references cards on delete cascade,
  tag_id uuid references tags on delete cascade,
  primary key (card_id, tag_id)
);

-- =========================================================
-- 4. REGRAS, APROVAÇÕES, AÇÕES, AUTOMAÇÕES
-- =========================================================
-- Regras de transição/edição. Avaliadas no servidor para todo canal (UI, API, import, automação).
create table rules (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards on delete cascade,
  kind text not null check (kind in ('can_enter','can_leave','can_back','can_edit','can_delete','can_create')),
  phase_id uuid references phases,                -- null = qualquer fase
  field_id uuid references fields,                -- para can_edit
  expr text not null,                             -- CEL. Contexto exposto (nomes PT-BR na UI → CEL):
                                                  --   card.<slug>            valor de campo do card atual (props+computed)
                                                  --   pai.<slug>             card pai (relação is_parent); pais(<rel>) lista
                                                  --   filhos(<rel>)          lista de cards ligados; .todos(x, cond) .algum(x, cond) .contar() .soma(slug)
                                                  --   fase, fase_origem, fase_destino, usuario, hoje()
                                                  --   existe(<board>, cond)  consulta em qualquer board do workspace
  message text,                                   -- mostrado quando bloqueia
  on_fail jsonb,                                  -- can_back: {children: 'block'|'cancel'|'delete'|'keep'}
  position int not null default 0,
  enabled bool not null default true
);

create table approvals (                         -- definição: "esta fase exige aprovação de X"
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards on delete cascade,
  phase_id uuid not null references phases on delete cascade,
  name text not null,
  approvers_expr text not null,                   -- CEL → lista de users/groups
  quorum int not null default 1,
  condition_expr text,                            -- só exigida se... (ex.: valor > 10000)
  deadline jsonb
);
create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references approvals,
  card_id uuid not null references cards on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','canceled')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz
);
create table approval_decisions (
  request_id uuid references approval_requests on delete cascade,
  user_id uuid references users,
  decision text not null check (decision in ('approve','reject')),
  note text,
  decided_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

-- Ação = botão no card. Automação = mesmos passos com gatilho. Mesmo executor.
create table actions (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards on delete cascade,
  name text not null,
  icon text,
  visible_expr text,
  form_schema jsonb,                              -- inputs pedidos antes de executar (mini-form)
  steps jsonb not null,                           -- [{type:'set_field'|'move'|'create_card'|'create_related'|'send_email'|'http'|'assign'|'add_tag'|'run_flow'|'comment'|'wait'|'branch', ...}]
  run_as text not null default 'user' check (run_as in ('user','system')),
  enabled bool not null default true,
  archived_at timestamptz
);

create table automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  board_id uuid references boards on delete cascade,   -- null = nível workspace (cron, webhook de entrada)
  name text not null,
  mode text not null default 'simple' check (mode in ('simple','flow')),
  trigger jsonb not null,                         -- {type:'card_created'|'card_moved'|'card_left_phase'|'field_updated'|'relation_changed'|'approval_decided'|'comment_added'|'sla'|'all_children_in_phase'|'email_received'|'http_response'|'cron'|'webhook'|'manual', ...params}
  condition_expr text,
  steps jsonb,                                    -- simple: lista linear; flow: grafo {nodes, edges}
  env text not null default 'draft' check (env in ('draft','test','published')),
  published_version int not null default 0,
  suppress_triggers bool not null default false,  -- não dispara outras automações
  enabled bool not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations,
  card_id uuid references cards,
  trigger_event_id uuid,                          -- FK para events
  status text not null check (status in ('queued','running','success','failed','skipped','dead')),
  attempt int not null default 1,
  log jsonb not null default '[]',
  started_at timestamptz,
  finished_at timestamptz
);
create index on automation_runs (automation_id, started_at desc);

create table connections (                       -- credenciais reutilizáveis (OAuth2, api key, SMTP, IMAP)
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  name text not null,
  type text not null,
  secret_ref text not null,                       -- referência no cofre, nunca o segredo
  config jsonb not null default '{}'
);
create table variables (
  workspace_id uuid references workspaces,
  key text not null,
  value text not null,
  is_secret bool not null default false,
  primary key (workspace_id, key)
);

create table calendars (                         -- dias úteis/feriados/horário comercial para SLA e prazos
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  name text not null,
  config jsonb not null                           -- {work_days, hours, holidays[]}
);

-- =========================================================
-- 5. EVENTOS (LOG IMUTÁVEL) E WEBHOOKS
-- =========================================================
create table events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  board_id uuid,
  card_id uuid,
  type text not null,                             -- card.created, card.moved, card.field_updated, card.link_added, card.link_removed, card.deleted, comment.added, approval.decided, automation.ran, config.changed, ...
  actor_type text not null check (actor_type in ('user','automation','api','system','import','form')),
  actor_id uuid,
  data jsonb not null,                            -- field_updated: {field_id, old, new}; moved: {from_phase, to_phase}
  occurred_at timestamptz not null default now()
);
create index on events (card_id, occurred_at);
create index on events (board_id, occurred_at);
create index on events (workspace_id, type, occurred_at);
-- Sem update/delete: revogar via grants + trigger que rejeita.

create table webhooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  board_id uuid references boards on delete cascade,
  url text not null,
  event_types text[] not null,
  filter_expr text,
  secret_ref text,
  enabled bool not null default true
);
create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references webhooks on delete cascade,
  event_id uuid not null references events,
  status text not null check (status in ('queued','sent','failed','dead')),
  attempt int not null default 1,
  response jsonb,
  next_retry_at timestamptz
);

-- =========================================================
-- 6. VIEWS, FORMS, PORTAIS, DASHBOARDS
-- =========================================================
create table views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  board_id uuid references boards on delete cascade,   -- null = cross-board
  type text not null check (type in ('kanban','table','calendar','timeline','gantt','health','activity','dashboard')),
  name text not null,
  config jsonb not null default '{}',             -- colunas, filtros (CEL ou AST), agrupamento, ordenação, agregações, boards[] para cross-board, widgets p/ dashboard
  owner_id uuid references users,
  is_shared bool not null default true,
  position int not null default 0
);

create table forms (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards on delete cascade,
  name text not null,
  visibility text not null default 'internal' check (visibility in ('internal','private','public')),
  public_slug text unique,
  target_phase_id uuid references phases,
  field_ids uuid[] not null,
  settings jsonb not null default '{}',           -- branding, mensagem pós-envio, captcha, coleta e-mail, prefill, reuso do último envio
  enabled bool not null default true
);

create table portals (                           -- página composta de blocos
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  parent_id uuid references portals,
  name text not null,
  visibility text not null default 'internal' check (visibility in ('internal','private','public')),
  public_slug text unique,
  blocks jsonb not null default '[]'              -- [{type:'table'|'form'|'text'|'link'|'image'|'video'|'embed'|'document', config}]
);

-- =========================================================
-- 7. CONFIGURAÇÃO VERSIONADA, TEMPLATES, EXTENSÕES
-- =========================================================
create table board_snapshots (                   -- export JSON completo do board (fases, campos, regras, ações, automações, views, forms)
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards on delete cascade,
  version int not null,
  label text,
  config jsonb not null,
  created_by uuid references users,
  created_at timestamptz not null default now(),
  unique (board_id, version)
);
-- Sandbox = board clonado com origin_board_id em boards.settings; "promover" = diff + apply no original.

create table templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces,        -- null = template do sistema
  name text not null,
  category text,
  config jsonb not null,                          -- N boards + relações entre eles + automações + portais
  version text not null default '1.0.0'
);

create table extensions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces,
  name text not null,
  manifest jsonb not null,                        -- surfaces: card_badge, card_button, card_tab, board_button, board_view; init_url
  enabled bool not null default true
);
create table extension_data (                    -- KV por extensão (equivalente a custom app data)
  extension_id uuid references extensions on delete cascade,
  scope_type text not null check (scope_type in ('workspace','board','card','user')),
  scope_id uuid not null,
  key text not null,
  value jsonb not null,
  primary key (extension_id, scope_type, scope_id, key)
);
