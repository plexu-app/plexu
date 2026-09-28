-- Workspace arquivado (some das listas, dados intactos, restaurável) e excluído (lápide: boards, cards,
-- ligações, anexos, comentários, automações e views removidos; a linha fica para os eventos).
alter table workspaces add column archived_at timestamptz;
alter table workspaces add column deleted_at timestamptz;

-- Eventos continuam append-only; a exclusão do workspace só os marca, para auditoria.
alter table events add column workspace_deleted_at timestamptz;

-- Única mudança permitida em events: marcar workspace_deleted_at (uma vez), com o workspace já excluído
-- e nada mais alterado na linha.
create or replace function events_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and old.workspace_deleted_at is null
     and new.workspace_deleted_at is not null
     and (to_jsonb(new) - 'workspace_deleted_at') = (to_jsonb(old) - 'workspace_deleted_at')
     and exists (select 1 from workspaces w where w.id = new.workspace_id and w.deleted_at is not null) then
    return new;
  end if;
  raise exception 'events are append-only';
end $$;
