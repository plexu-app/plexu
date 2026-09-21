-- 0000_init — MVP v0 (17 tabelas). Fonte da verdade: docs/schema.sql (modelo completo).
create extension if not exists pgcrypto;
create extension if not exists citext;

-- 1. tenant / identidade ------------------------------------------------
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext unique not null,
  name text not null,
  auth jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid references workspaces on delete cascade,
  user_id uuid references users on delete cascade,
  org_role text not null check (org_role in ('owner','admin','member','guest')),
  primary key (workspace_id, user_id)
);

-- 2. board / fase / campo -----------------------------------------------
create table boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  kind text not null default 'workflow' check (kind in ('workflow','database')),
  name text not null,
  slug text not null,
  icon text,
  title_field_id uuid,
  settings jsonb not null default '{}',
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
  is_terminal bool not null default false,
  allow_create bool not null default false,
  assignee_expr text,
  sla jsonb,
  settings jsonb not null default '{}',
  archived_at timestamptz,
  unique (board_id, position) deferrable initially deferred
);

create table fields (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards on delete cascade,
  type text not null,
  name text not null,
  slug text not null,
  description text,
  help_text text,
  required_expr text,
  visible_expr text,
  unique_value bool not null default false,
  default_value_expr text,
  validation jsonb,
  config jsonb not null default '{}',
  position int not null default 0,
  archived_at timestamptz,
  unique (board_id, slug)
);
alter table boards add foreign key (title_field_id) references fields deferrable initially deferred;

create table field_phase_settings (
  field_id uuid references fields on delete cascade,
  phase_id uuid references phases on delete cascade,
  visible bool,
  editable bool,
  required bool,
  position int,
  primary key (field_id, phase_id)
);

-- 3. cards / relações ---------------------------------------------------
create table cards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  board_id uuid not null references boards on delete cascade,
  phase_id uuid references phases,
  title text not null default '',
  props jsonb not null default '{}',
  computed jsonb not null default '{}',
  assignees uuid[] not null default '{}',
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','done','canceled')),
  created_by uuid references users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  phase_entered_at timestamptz,
  deleted_at timestamptz
);
create index cards_board_phase_idx on cards (board_id, phase_id) where deleted_at is null;
create index cards_props_idx on cards using gin (props jsonb_path_ops);

create table card_links (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields on delete cascade,
  from_card_id uuid not null references cards on delete cascade,
  to_card_id uuid not null references cards on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (field_id, from_card_id, to_card_id)
);
create index card_links_to_idx on card_links (to_card_id);
-- relação exclusiva: índice único parcial criado pela aplicação ao configurar o campo:
--   create unique index card_links_excl_<field> on card_links (to_card_id) where field_id = '<field>';

create table sequences (
  field_id uuid references fields on delete cascade,
  scope_key text not null default '',
  last_value bigint not null default 0,
  primary key (field_id, scope_key)
);

create table card_comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards on delete cascade,
  parent_id uuid references card_comments,
  author_id uuid references users,
  body text not null,
  source text not null default 'user' check (source in ('user','email','automation','system')),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
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

-- 4. regras / ações / automações -------------------------------------------
create table rules (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards on delete cascade,
  kind text not null check (kind in ('can_enter','can_leave','can_back','can_edit','can_delete','can_create')),
  phase_id uuid references phases on delete cascade,
  field_id uuid references fields on delete cascade,
  expr text not null,
  message text,
  on_fail jsonb,
  position int not null default 0,
  enabled bool not null default true
);

create table actions (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards on delete cascade,
  name text not null,
  icon text,
  visible_expr text,
  form_schema jsonb,
  steps jsonb not null,
  run_as text not null default 'user' check (run_as in ('user','system')),
  enabled bool not null default true,
  archived_at timestamptz
);

create table automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  board_id uuid references boards on delete cascade,
  name text not null,
  mode text not null default 'simple' check (mode in ('simple','flow')),
  trigger jsonb not null,
  condition_expr text,
  steps jsonb,
  env text not null default 'draft' check (env in ('draft','test','published')),
  published_version int not null default 0,
  suppress_triggers bool not null default false,
  enabled bool not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations on delete cascade,
  card_id uuid references cards on delete set null,
  trigger_event_id uuid,
  status text not null check (status in ('queued','running','success','failed','skipped','dead')),
  attempt int not null default 1,
  log jsonb not null default '[]',
  started_at timestamptz,
  finished_at timestamptz
);
create index automation_runs_idx on automation_runs (automation_id, started_at desc);

-- 5. eventos (imutável) ---------------------------------------------------
create table events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  board_id uuid,
  card_id uuid,
  type text not null,
  actor_type text not null check (actor_type in ('user','automation','api','system','import','form')),
  actor_id uuid,
  data jsonb not null,
  occurred_at timestamptz not null default now()
);
create index events_card_idx on events (card_id, occurred_at);
create index events_board_idx on events (board_id, occurred_at);
create index events_ws_type_idx on events (workspace_id, type, occurred_at);

create or replace function events_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'events are append-only';
end $$;
create trigger events_no_update before update or delete on events
  for each row execute function events_immutable();

-- 6. views (kanban/tabela) --------------------------------------------------
create table views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  board_id uuid references boards on delete cascade,
  type text not null check (type in ('kanban','table','calendar','timeline','gantt','health','activity','dashboard')),
  name text not null,
  config jsonb not null default '{}',
  owner_id uuid references users,
  is_shared bool not null default true,
  position int not null default 0
);

-- updated_at automático
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger boards_touch before update on boards for each row execute function touch_updated_at();
create trigger cards_touch before update on cards for each row execute function touch_updated_at();
create trigger automations_touch before update on automations for each row execute function touch_updated_at();
