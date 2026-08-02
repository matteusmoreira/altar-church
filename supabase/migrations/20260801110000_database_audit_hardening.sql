-- Hardening gerado a partir do audit-database:
-- 1) cobre FKs publicas ainda sem indice no prefixo correto;
-- 2) fecha o RLS do healthcheck sem expor escrita anonima.
do $migration$
declare
  foreign_key record;
  index_name text;
  column_list text;
begin
  for foreign_key in
    select
      c.oid as constraint_oid,
      c.conrelid as table_oid,
      ns.nspname as schema_name,
      cls.relname as table_name,
      array_agg(att.attname order by keys.ordinality) as columns
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality as keys(attnum, ordinality)
    join pg_attribute att on att.attrelid = c.conrelid and att.attnum = keys.attnum
    join pg_class cls on cls.oid = c.conrelid
    join pg_namespace ns on ns.oid = c.connamespace
    where c.contype = 'f'
      and ns.nspname = 'public'
      and not exists (
        select 1
        from pg_index idx
        where idx.indrelid = c.conrelid
          and idx.indisvalid
          and c.conkey <@ (idx.indkey::smallint[])[0:cardinality(c.conkey)-1]
      )
    group by c.oid, c.conrelid, ns.nspname, cls.relname
  loop
    index_name := 'fk_' || substr(md5(foreign_key.table_oid::text || ':' || foreign_key.constraint_oid::text), 1, 24);
    select string_agg(format('%I', column_name), ', ' order by ordinal)
      into column_list
    from unnest(foreign_key.columns) with ordinality as names(column_name, ordinal);

    execute format(
      'create index if not exists %I on %I.%I (%s)',
      index_name,
      foreign_key.schema_name,
      foreign_key.table_name,
      column_list
    );
    execute format('analyze %I.%I', foreign_key.schema_name, foreign_key.table_name);
  end loop;
end
$migration$;

alter table public.healthcheck enable row level security;
drop policy if exists healthcheck_public_read on public.healthcheck;
create policy healthcheck_public_read
  on public.healthcheck
  for select
  to anon, authenticated
  using (true);

drop policy if exists healthcheck_service_write on public.healthcheck;
create policy healthcheck_service_write
  on public.healthcheck
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.healthcheck to anon, authenticated;
