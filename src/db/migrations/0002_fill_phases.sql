-- Decisão 18-revisada: fields.config.origin_phase_id (fase única) vira fields.config.fill_phases
-- (lista de fases onde o campo é preenchido). Só dados; a coluna config (jsonb) não muda.
UPDATE fields
SET config = (config - 'origin_phase_id')
  || jsonb_build_object('fill_phases', jsonb_build_array(config -> 'origin_phase_id'))
WHERE config ? 'origin_phase_id'
  AND jsonb_typeof(config -> 'origin_phase_id') = 'string'
  AND NOT config ? 'fill_phases';

UPDATE fields SET config = config - 'origin_phase_id' WHERE config ? 'origin_phase_id';
