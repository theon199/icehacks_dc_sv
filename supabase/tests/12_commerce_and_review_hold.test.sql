begin;
create extension if not exists pgtap schema extensions;
select no_plan();

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

create function tests.login(p_id uuid)
returns void
language sql
as $fn$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$fn$;

grant execute on all functions in schema tests to authenticated, anon;

select tests.create_user('aaaaaaaa-0000-4000-8000-0000000000c1', 'cora');

-- ---------------------------------------------------------------------------------------------
-- Price cache rows
-- ---------------------------------------------------------------------------------------------

select lives_ok(
  $$insert into public.ingredient_price_cache (cache_key, ingredient_id, status, expires_at)
    values ('us:saffron', 'saffron', 'not_found', now() + interval '3 days')$$,
  'a not-found price needs no price, unit or source'
);
select throws_ok(
  $$insert into public.ingredient_price_cache (cache_key, ingredient_id, status, unit, price_cents, source_name, expires_at)
    values ('us:leek', 'leek', 'priced', 'each', 199, 'Grocer', now() + interval '14 days')$$,
  '23514', null, 'a listed price must link to its listing'
);
select lives_ok(
  $$insert into public.ingredient_price_cache
      (cache_key, ingredient_id, status, unit, package_qty, price_cents, source_name, source_url, expires_at)
    values ('us:leek', 'leek', 'priced', 'lb', 1.5, 299, 'Grocer', 'https://www.example.test/leek', now() + interval '14 days')$$,
  'a complete listed price is stored'
);
select throws_ok(
  $$insert into public.ingredient_price_cache (cache_key, ingredient_id, status, expires_at)
    values ('us:x', 'x', 'maybe', now())$$,
  '23514', null, 'status is priced or not_found'
);

-- ---------------------------------------------------------------------------------------------
-- Usage budgets and fill leases (service role only)
-- ---------------------------------------------------------------------------------------------

select is(public.reserve_usage('prices_fill:global', 'month', 3, 5), 3, 'grants the units asked for');
select is(public.reserve_usage('prices_fill:global', 'month', 3, 5), 2, 'grants only what is left');
select is(public.reserve_usage('prices_fill:global', 'month', 1, 5), 0, 'grants nothing once spent');
select lives_ok($$select public.release_usage('prices_fill:global', 'month', 2)$$, 'units can be given back');
select is(public.reserve_usage('prices_fill:global', 'month', 5, 5), 2, 'released units can be reserved again');
select throws_ok(
  $$select public.reserve_usage('Bad Bucket', 'day', 1, 1)$$,
  '22023', 'invalid_bucket', 'bucket names are validated'
);

select is(
  (select array_agg(k order by k) from public.claim_fill_leases(
     array['us:leek', 'us:kale', 'us:kale'], 'aaaaaaaa-0000-4000-8000-0000000000f1') k),
  array['us:kale', 'us:leek'],
  'free keys are claimed once each'
);
select is(
  (select array_agg(k order by k) from public.claim_fill_leases(
     array['us:leek', 'us:okra'], 'aaaaaaaa-0000-4000-8000-0000000000f2') k),
  array['us:okra'],
  'keys held by another holder are not claimed'
);
select is(
  (select count(*)::integer from public.claim_fill_leases(array['us:leek'], 'aaaaaaaa-0000-4000-8000-0000000000f1')),
  1,
  'a holder can renew its own lease'
);
update private.fill_leases set expires_at = now() - interval '1 second' where lease_key = 'us:leek';
select is(
  (select array_agg(k) from public.claim_fill_leases(array['us:leek'], 'aaaaaaaa-0000-4000-8000-0000000000f2') k),
  array['us:leek'],
  'an expired lease can be taken over'
);
select is(
  public.release_fill_leases(array['us:leek', 'us:kale'], 'aaaaaaaa-0000-4000-8000-0000000000f2'),
  1,
  'only the holder releases its leases'
);

-- ---------------------------------------------------------------------------------------------
-- Walmart item map
-- ---------------------------------------------------------------------------------------------

insert into public.walmart_item_map (ingredient_id, item_id, approved)
values ('leek', '10450114', true), ('kale', '44391472', false);
select throws_ok(
  $$insert into public.walmart_item_map (ingredient_id, item_id) values ('okra', 'abc')$$,
  '23514', null, 'item ids are numeric'
);

set local role authenticated;
select tests.login('aaaaaaaa-0000-4000-8000-0000000000c1');

select is(
  (select array_agg(ingredient_id) from public.walmart_item_map),
  array['leek'],
  'members read approved mappings only'
);
select throws_ok(
  $$insert into public.walmart_item_map (ingredient_id, item_id) values ('okra', '1')$$,
  '42501', null, 'members cannot write mappings'
);
select throws_ok(
  $$select count(*) from public.walmart_item_cache$$,
  '42501', null, 'members cannot read the item cache'
);
select throws_ok(
  $$select public.reserve_usage('prices_fill:global', 'month', 1, 5)$$,
  '42501', null, 'members cannot spend usage budgets'
);
select throws_ok(
  $$select public.claim_fill_leases(array['us:leek'], gen_random_uuid())$$,
  '42501', null, 'members cannot claim fill leases'
);

-- ---------------------------------------------------------------------------------------------
-- Review hold header
-- ---------------------------------------------------------------------------------------------

select is(
  (public.publish_post('tip', 'Plain tip', 'Toast the spices first.')).status,
  'visible'::public.content_status,
  'without the header clean text is published'
);
select set_config('request.headers', '{"x-famara-review-hold":"spam"}', true);
select is(
  (public.publish_post('tip', 'Held tip', 'Toast the spices first.')).status,
  'hidden'::public.content_status,
  'the review-hold header stores the post hidden'
);
select is(
  (public.add_comment(
     (select id from public.posts where title = 'Plain tip'), 'Nice one')).status,
  'hidden'::public.content_status,
  'the review-hold header stores the comment hidden'
);
select set_config('request.headers', '{}', true);
select is(
  (public.add_comment((select id from public.posts where title = 'Plain tip'), 'Thanks!')).status,
  'visible'::public.content_status,
  'other headers do not hold content'
);

reset role;

select * from finish();
rollback;
