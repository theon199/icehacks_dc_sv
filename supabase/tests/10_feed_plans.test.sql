begin;
create extension if not exists pgtap schema extensions;
select no_plan();

-- Test helpers live in a throwaway schema inside this transaction.
create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.create_user(p_id uuid, p_handle text, p_birth_year integer default 1990)
returns uuid
language plpgsql
as $fn$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (p_id, p_handle || '@example.test', jsonb_build_object('handle', p_handle, 'display_name', initcap(p_handle)));
  if p_birth_year is not null then
    insert into private.account_ages (user_id, birth_year) values (p_id, p_birth_year);
  end if;
  return p_id;
end;
$fn$;

-- Sets the JWT claims PostgREST would set for a signed-in user.
create function tests.login(p_id uuid)
returns void
language sql
as $fn$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$fn$;

create function tests.logout()
returns void
language sql
as $fn$
  select set_config('request.jwt.claims', '', true);
$fn$;

grant execute on all functions in schema tests to authenticated, anon;

-- Feed query plans. The statements below have the same text as the matching get_feed branches,
-- prepared with parameters and forced to a generic plan, which is how PL/pgSQL runs them.
select tests.create_user('aaaaaaaa-0000-4000-8000-000000000001', 'ana');
select tests.create_user('bbbbbbbb-0000-4000-8000-000000000002', 'ben');

insert into public.posts (author_id, kind, title, created_at)
select
  case when g % 2 = 0 then 'aaaaaaaa-0000-4000-8000-000000000001'::uuid
       else 'bbbbbbbb-0000-4000-8000-000000000002'::uuid end,
  'tip', 'Seed ' || g, now() - make_interval(mins => g)
from generate_series(1, 5000) g;
insert into public.follows (follower_id, followee_id)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002');
analyze public.posts;
analyze public.follows;

create function tests.plan_of(p_sql text)
returns text
language plpgsql
as $fn$
declare
  v_line text;
  v_plan text := '';
begin
  for v_line in execute 'explain ' || p_sql loop
    v_plan := v_plan || v_line || E'\n';
  end loop;
  return v_plan;
end;
$fn$;
grant execute on function tests.plan_of(text) to authenticated;

set local plan_cache_mode = force_generic_plan;
set local role authenticated;
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');

prepare feed_new(uuid, timestamptz, uuid, integer) as
  select p.id, p.created_at
  from public.posts p
  where p.status = 'visible'
    and (p.created_at, p.id) < ($2, $3)
    and not private.is_blocked_pair($1, p.author_id)
  order by p.created_at desc, p.id desc
  limit $4 + 1;

prepare feed_following(uuid, timestamptz, uuid, integer) as
  select p.id, p.created_at
  from public.posts p
  where p.status = 'visible'
    and (p.created_at, p.id) < ($2, $3)
    and p.author_id in (
      select f.followee_id from public.follows f where f.follower_id = $1
      union all
      select $1
    )
    and not private.is_blocked_pair($1, p.author_id)
  order by p.created_at desc, p.id desc
  limit $4 + 1;

prepare feed_author(uuid, timestamptz, uuid, integer) as
  select p.id, p.created_at
  from public.posts p
  where p.author_id = $1
    and p.status = 'visible'
    and (p.created_at, p.id) < ($2, $3)
  order by p.created_at desc, p.id desc
  limit $4 + 1;

select diag(tests.plan_of($$execute feed_new('aaaaaaaa-0000-4000-8000-000000000001', 'infinity', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 20)$$));
select diag(tests.plan_of($$execute feed_following('aaaaaaaa-0000-4000-8000-000000000001', 'infinity', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 20)$$));
select diag(tests.plan_of($$execute feed_author('bbbbbbbb-0000-4000-8000-000000000002', 'infinity', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 20)$$));

select matches(
  tests.plan_of($$execute feed_new('aaaaaaaa-0000-4000-8000-000000000001', 'infinity', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 20)$$),
  'Index Scan using posts_visible_created_idx',
  'the new feed walks the visible-posts index in order'
);
select unalike(
  tests.plan_of($$execute feed_new('aaaaaaaa-0000-4000-8000-000000000001', 'infinity', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 20)$$),
  '%Sort%',
  'the new feed needs no sort'
);
select unalike(
  tests.plan_of($$execute feed_author('bbbbbbbb-0000-4000-8000-000000000002', 'infinity', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 20)$$),
  '%Seq Scan on posts%',
  'the author feed does not scan every post'
);
reset role;

select * from finish();
rollback;
