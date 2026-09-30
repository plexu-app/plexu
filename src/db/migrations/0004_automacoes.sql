-- Motor de automações v1 (modo simples): execuções, despacho a partir de events, variáveis e conexões.

-- Execução que causou o evento: o executor grava plexu.run_id na própria transação (set_config local);
-- toda escrita do core nela, inclusive em savepoints, herda o valor. Base da proteção contra loop.
alter table events add column automation_run_id uuid
  default nullif(current_setting('plexu.run_id', true), '')::uuid;
create index events_occurred_idx on events (occurred_at);

-- Execuções: de automação ou de ação (botão no card), pelo mesmo executor.
alter table automation_runs alter column automation_id drop not null;
alter table automation_runs add column action_id uuid references actions on delete cascade;
alter table automation_runs add constraint automation_runs_origem check (automation_id is not null or action_id is not null);
alter table automation_runs add column workspace_id uuid references workspaces on delete cascade;
alter table automation_runs add column env text not null default 'published' check (env in ('test','published'));
alter table automation_runs add column depth int not null default 0;          -- profundidade da cascata
alter table automation_runs add column chain uuid[] not null default '{}';     -- automações já disparadas neste ciclo
alter table automation_runs add column dedupe_key text;                        -- um disparo por (automação, chave)
alter table automation_runs add column context jsonb not null default '{}';    -- gatilho, fases, form, quem pediu
alter table automation_runs add column error text;
alter table automation_runs add column created_at timestamptz not null default now();
create unique index automation_runs_dedupe on automation_runs (automation_id, dedupe_key) where dedupe_key is not null;
create index automation_runs_status_idx on automation_runs (status, created_at);
create index automation_runs_ws_idx on automation_runs (workspace_id, created_at desc);
create index automation_runs_action_idx on automation_runs (action_id, created_at desc);

-- Eventos já despachados para as automações (sem cursor: aguenta commits fora de ordem).
create table automation_dispatch (
  event_id uuid primary key,
  dispatched_at timestamptz not null default now()
);

-- Variáveis e conexões do workspace. Segredos cifrados (AES-256-GCM com chave derivada do APP_SECRET).
create table variables (
  workspace_id uuid not null references workspaces on delete cascade,
  key text not null check (key ~ '^[A-Za-z_][A-Za-z0-9_]*$'),
  value text not null,
  is_secret bool not null default false,
  primary key (workspace_id, key)
);

create table connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name text not null,
  type text not null check (type in ('smtp')),
  secret_ref text,                                -- chave de uma variável secreta (senha), nunca o segredo
  config jsonb not null default '{}'
);
create unique index connections_ws_nome on connections (workspace_id, name);
