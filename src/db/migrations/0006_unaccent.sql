-- Busca sem acento (kanban, lista, relação): "acao" acha "Ação".
-- unaccent() não é imutável (depende do dicionário configurado); f_unaccent fixa o dicionário e pode ser
-- usada em índices de expressão no futuro.
create extension if not exists unaccent;

create or replace function f_unaccent(text) returns text
  language sql immutable strict parallel safe
  as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$;
