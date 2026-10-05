-- Regras em várias fases: phase_id (uma fase) vira phase_ids (lista; null = todas as fases) e ganha
-- from_phase_id ("a partir da fase X": X e as seguintes, por posição, inclusive fases criadas depois).
alter table rules add column phase_ids uuid[];
alter table rules add column from_phase_id uuid references phases on delete cascade;
update rules set phase_ids = array[phase_id] where phase_id is not null;
alter table rules drop column phase_id;
alter table rules add constraint rules_fases check (
  (phase_ids is null or cardinality(phase_ids) > 0) and (phase_ids is null or from_phase_id is null)
);
