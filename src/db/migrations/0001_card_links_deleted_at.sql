-- Decisão 17: exclusão lógica de card não remove card_links. A ligação fica inativa
-- (deleted_at espelha o deleted_at do card excluído) e volta ao restaurar o card.
alter table card_links add column deleted_at timestamptz;
create index card_links_ativos_to_idx on card_links (to_card_id) where deleted_at is null;

-- Índices de relação exclusiva passam a ignorar ligações inativas: recria os existentes.
do $$
declare r record;
begin
  for r in select indexname, substring(indexdef from $re$field_id = '([0-9a-f-]{36})'$re$) as fid
           from pg_indexes where tablename = 'card_links' and indexname like 'card_links_excl_%'
  loop
    execute format('drop index %I', r.indexname);
    if r.fid is not null then
      execute format('create unique index %I on card_links (to_card_id) where field_id = %L and deleted_at is null',
                     r.indexname, r.fid);
    end if;
  end loop;
end $$;
