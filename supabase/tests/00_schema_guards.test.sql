-- Structural guarantees every migration must keep.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select is(
  (select coalesce(array_agg(n.nspname || '.' || c.relname order by 1), '{}')
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'private') and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '{}'::text[],
  'every table in public and private has row level security enabled'
);

select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}')
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.prosecdef
     and not coalesce(p.proconfig @> array['search_path=""'], false)),
  '{}'::text[],
  'every security definer function pins an empty search_path'
);

select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}')
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and pg_catalog.has_function_privilege('anon', p.oid, 'execute')),
  '{}'::text[],
  'anon cannot execute any Famara function'
);

select is(
  (select coalesce(array_agg(n.nspname || '.' || c.relname order by 1), '{}')
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'private')
     and c.relkind in ('r', 'v', 'p')
     and pg_catalog.has_table_privilege('anon', c.oid, 'select')),
  '{}'::text[],
  'anon cannot read any Famara table or view'
);

select is(
  (select coalesce(array_agg(n.nspname || '.' || c.relname order by 1), '{}')
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private'
     and c.relkind in ('r', 'p')
     and pg_catalog.has_table_privilege('authenticated', c.oid, 'select')),
  '{}'::text[],
  'authenticated cannot read private tables'
);

select is(
  (select coalesce(array_agg(n.nspname || '.' || p.proname order by 1), '{}')
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and exists (
       select 1 from pg_catalog.pg_proc b
       where b.pronamespace = 'pg_catalog'::regnamespace and b.proname = p.proname
     )),
  '{}'::text[],
  'no Famara function shadows a pg_catalog builtin'
);

select is(
  (select coalesce(array_agg(c.conrelid::regclass::text || ':' || c.conname order by 1), '{}')
   from pg_catalog.pg_constraint c
   join pg_catalog.pg_namespace n on n.oid = c.connamespace
   where c.contype = 'f'
     and n.nspname in ('public', 'private')
     and not exists (
       select 1
       from pg_catalog.pg_index i
       where i.indrelid = c.conrelid
         and (
           select array_agg(k order by k)
           from unnest((i.indkey::int2[])[0:cardinality(c.conkey) - 1]) k
         ) = (select array_agg(k order by k) from unnest(c.conkey) k)
     )),
  '{}'::text[],
  'every foreign key is covered by an index'
);

select is(
  (select count(*)::integer from public.badges),
  9,
  'badge catalog is seeded'
);

select is(
  (select array_agg(id order by id) from storage.buckets where id in ('avatars', 'post-media', 'snap-uploads')),
  array['avatars', 'post-media', 'snap-uploads'],
  'storage buckets exist'
);

select is(
  (select public from storage.buckets where id = 'post-media'),
  false,
  'post-media bucket is private'
);

select * from finish();
rollback;
