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
select tests.create_user('aaaaaaaa-0000-4000-8000-0000000000d2', 'dara');

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
select lives_ok(
  $$insert into public.ingredient_price_cache (cache_key, ingredient_id, status, expires_at)
    values ('us:okra', 'okra', 'retry_later', now() + interval '10 minutes')$$,
  'a retry-later marker needs no price either'
);
select throws_ok(
  $$insert into public.ingredient_price_cache (cache_key, ingredient_id, status, expires_at)
    values ('us:x', 'x', 'maybe', now())$$,
  '23514', null, 'status is priced, not_found or retry_later'
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
-- Review verdicts: only a fresh allow for the same member and text publishes visibly
-- ---------------------------------------------------------------------------------------------

select throws_ok(
  $$select public.record_text_review(
      'aaaaaaaa-0000-4000-8000-0000000000c1', 'post', 'Sneaky', '', 'allow')$$,
  '42501', null, 'members cannot record review verdicts'
);

select is(
  (public.publish_post('tip', 'Unreviewed tip', 'Toast the spices first.')).status,
  'hidden'::public.content_status,
  'a post without a review verdict is held'
);

reset role;
select is(
  (select r.reason::text || ' | ' || r.details from public.reports r
   join public.posts p on p.id::text = r.target_id
   where p.title = 'Unreviewed tip' and r.automated),
  'other | Automatic pre-publication review: no AI review cleared this text.',
  'the automated report says no review cleared it'
);
select lives_ok(
  $$select public.record_text_review(
      'aaaaaaaa-0000-4000-8000-0000000000c1', 'post', '  Cleared tip ', 'Toast the spices first.', 'allow')$$,
  'the service role records an allow'
);
set local role authenticated;
select tests.login('aaaaaaaa-0000-4000-8000-0000000000c1');

select is(
  (public.publish_post('tip', 'Cleared tip', 'Toast the spices first.')).status,
  'visible'::public.content_status,
  'an allow for the same text publishes visibly'
);
select is(
  (public.publish_post('tip', 'Cleared tip', 'Toast the spices first.')).status,
  'hidden'::public.content_status,
  'an allow is spent by the first publish'
);

reset role;
select public.record_text_review(
  'aaaaaaaa-0000-4000-8000-0000000000c1', 'comment', null, 'Lovely idea', 'allow');
select public.record_text_review(
  'aaaaaaaa-0000-4000-8000-0000000000d2', 'comment', null, 'Great photo', 'allow');
select public.record_text_review(
  'aaaaaaaa-0000-4000-8000-0000000000c1', 'comment', null, 'Old news', 'allow');
update private.review_verdicts set expires_at = now() - interval '1 second'
where text_sha256 = private.review_digest('Old news');
select public.record_text_review(
  'aaaaaaaa-0000-4000-8000-0000000000c1', 'comment', null, 'Buy my stuff', 'hold', 'spam');
select public.record_text_review(
  'aaaaaaaa-0000-4000-8000-0000000000c1', 'comment', null, 'Get cheap followers now', 'allow');
insert into private.review_terms (term) values ('cheap followers') on conflict do nothing;
set local role authenticated;
select tests.login('aaaaaaaa-0000-4000-8000-0000000000c1');

select is(
  (public.add_comment((select id from public.posts where title = 'Cleared tip' and status = 'visible'),
     'Lovely idea!')).status,
  'hidden'::public.content_status,
  'an allow for different text does not clear a comment'
);
select is(
  (public.add_comment((select id from public.posts where title = 'Cleared tip' and status = 'visible'),
     'Lovely idea')).status,
  'visible'::public.content_status,
  'an allow for the same comment text publishes it'
);
select is(
  (public.add_comment((select id from public.posts where title = 'Cleared tip' and status = 'visible'),
     'Great photo')).status,
  'hidden'::public.content_status,
  'another member''s allow does not clear the caller'
);
select is(
  (public.add_comment((select id from public.posts where title = 'Cleared tip' and status = 'visible'),
     'Old news')).status,
  'hidden'::public.content_status,
  'an expired allow does not clear the text'
);
select is(
  (public.add_comment((select id from public.posts where title = 'Cleared tip' and status = 'visible'),
     'Buy my stuff')).status,
  'hidden'::public.content_status,
  'a hold verdict keeps the comment hidden'
);
select is(
  (public.add_comment((select id from public.posts where title = 'Cleared tip' and status = 'visible'),
     'Get cheap followers now')).status,
  'hidden'::public.content_status,
  'review terms still hold text the AI review allowed'
);

reset role;
select is(
  (select r.reason::text || ' | ' || r.details from public.reports r
   join public.comments c on c.id::text = r.target_id
   where c.body = 'Buy my stuff' and r.automated),
  'spam | Automatic pre-publication review held it (spam).',
  'the reviewer''s category reaches the automated report'
);
select is(
  (select r.details from public.reports r
   join public.comments c on c.id::text = r.target_id
   where c.body = 'Get cheap followers now' and r.automated),
  'Automatic pre-publication review: the AI review allowed it, but it matched a review term or link rule.',
  'a rule hold after an allow is labelled as such'
);
select is(
  (select count(*)::integer from private.review_verdicts
   where user_id = 'aaaaaaaa-0000-4000-8000-0000000000c1' and used_at is not null),
  4,
  'each verdict that was found was spent'
);
select throws_ok(
  $$select public.record_text_review(
      'aaaaaaaa-0000-4000-8000-0000000000c1', 'story', null, 'x', 'allow')$$,
  '22023', 'invalid_target', 'targets are post or comment'
);
select throws_ok(
  $$select public.record_text_review(
      'aaaaaaaa-0000-4000-8000-0000000000c1', 'comment', null, 'x', 'allow', null, 3600)$$,
  '22023', 'invalid_ttl', 'verdicts are short-lived'
);

select * from finish();
rollback;
