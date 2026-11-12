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

-- Moderation tools are role-gated; decisions notify owners, can be appealed and reversed.
select tests.create_user('aaaaaaaa-0000-4000-8000-000000000001', 'ana');
select tests.create_user('bbbbbbbb-0000-4000-8000-000000000002', 'ben');
select tests.create_user('cccccccc-0000-4000-8000-000000000003', 'cai');
select tests.create_user('dddddddd-0000-4000-8000-000000000004', 'mod');
select tests.create_user('eeeeeeee-0000-4000-8000-000000000005', 'eve');
insert into public.user_roles (user_id, role) values ('dddddddd-0000-4000-8000-000000000004', 'moderator');

set local role authenticated;

select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok($$select public.publish_post('tip', 'Questionable tip', 'Eat raw chicken.')$$, 'ana posts');
select lives_ok($$select public.publish_post('tip', 'Fine tip', 'Rinse your rice.')$$, 'ana posts again');

-- Members cannot use moderator tools.
select throws_ok($$select public.moderation_queue()$$, 'PT403', 'forbidden', 'members cannot read the queue');
select throws_ok(
  $$select public.moderate('post', (select id::text from public.posts where title = 'Fine tip'), 'hide', 'test')$$,
  'PT403', 'forbidden', 'members cannot moderate'
);
select throws_ok($$select public.appeal_queue()$$, 'PT403', 'forbidden', 'members cannot read appeals');
select throws_ok(
  $$select public.report_content('post', (select id::text from public.posts where title = 'Fine tip'), 'spam')$$,
  '22023', 'invalid_target', 'you cannot report your own post'
);

-- Ben reports Ana's post (twice: the second call is idempotent).
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select lives_ok(
  $$select public.report_content('post', (select id::text from public.posts where title = 'Questionable tip'), 'unsafe_food', 'Raw chicken')$$,
  'ben reports the post'
);
select lives_ok(
  $$select public.report_content('post', (select upper(id::text) from public.posts where title = 'Questionable tip'), 'unsafe_food')$$,
  'ben reports it again with a differently cased id'
);
select is((select count(*)::integer from public.reports), 1, 'duplicate open reports collapse into one');

-- The moderator reviews.
select tests.login('dddddddd-0000-4000-8000-000000000004');
select is(
  (select jsonb_array_length(public.moderation_queue() -> 'items')),
  1,
  'the report is queued'
);
select is(
  (public.moderation_queue() -> 'items' -> 0 -> 'target' ->> 'title'),
  'Questionable tip',
  'the queue shows the reported content'
);
select lives_ok(
  $$select public.moderate('post', (select id::text from public.posts where title = 'Questionable tip'), 'hide', 'Unsafe food handling advice.')$$,
  'moderator hides the post'
);
select is(
  (select status from public.posts where title = 'Questionable tip'),
  'hidden'::public.content_status,
  'post is hidden'
);
select is(
  (select status from public.reports limit 1),
  'actioned'::public.report_status,
  'report is resolved'
);
select is(jsonb_array_length(public.moderation_queue() -> 'items'), 0, 'queue is empty');

-- Ana is notified and appeals.
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select is(
  (select data ->> 'action' from public.notifications where kind = 'moderation'),
  'hide',
  'owner receives a moderation notice'
);
select lives_ok(
  $$select public.appeal((select action_id from public.my_moderation_decisions() where action = 'hide'), 'It was a joke, I will edit it.')$$,
  'owner appeals'
);
select throws_ok(
  $$select public.appeal((select action_id from public.my_moderation_decisions() where action = 'hide'), 'Again')$$,
  'PT409', 'already_appealed', 'one appeal per decision'
);

select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.appeal('00000000-0000-4000-8000-000000000000', 'Not mine')$$,
  'PT404', 'action_not_found', 'only owners can appeal'
);

select tests.login('dddddddd-0000-4000-8000-000000000004');
select is(jsonb_array_length(public.appeal_queue()), 1, 'appeal is queued');
select lives_ok(
  $$select public.decide_appeal((select id from public.moderation_appeals limit 1), 'reversed', 'Context accepted.')$$,
  'moderator reverses the decision'
);
select is(
  (select status from public.posts where title = 'Questionable tip'),
  'visible'::public.content_status,
  'reversal restores the post'
);
select is(
  (select count(*)::integer from public.moderation_actions where action = 'restore'),
  1,
  'the reversal is audited'
);
select throws_ok(
  $$select public.decide_appeal((select id from public.moderation_appeals limit 1), 'upheld')$$,
  'PT409', 'appeal_decided', 'appeals are decided once'
);

select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select is(
  (select data ->> 'outcome' from public.notifications where kind = 'appeal_decision'),
  'reversed',
  'owner hears the appeal outcome'
);
select is(
  (select count(*)::integer from public.notifications where kind = 'moderation'),
  1,
  'the reversal itself does not send a second moderation notice'
);

-- Three independent reports hide content automatically.
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select lives_ok($$select public.report_content('post', (select id::text from public.posts where title = 'Fine tip'), 'spam')$$, 'report 1');
select tests.login('cccccccc-0000-4000-8000-000000000003');
select lives_ok($$select public.report_content('post', (select id::text from public.posts where title = 'Fine tip'), 'spam')$$, 'report 2');
reset role;
select is((select status from public.posts where title = 'Fine tip'), 'visible'::public.content_status, 'two reports are not enough');
set local role authenticated;
select tests.login('eeeeeeee-0000-4000-8000-000000000005');
select lives_ok($$select public.report_content('post', (select id::text from public.posts where title = 'Fine tip'), 'spam')$$, 'report 3');
reset role;
select is((select status from public.posts where title = 'Fine tip'), 'hidden'::public.content_status, 'three reports hide the post');
select is(
  (select automated from public.moderation_actions where reason like 'Hidden after several reports%'),
  true,
  'automatic hides are marked as automated'
);
set local role authenticated;

-- Suspensions.
select tests.login('dddddddd-0000-4000-8000-000000000004');
select throws_ok(
  $$select public.moderate('user', 'bbbbbbbb-0000-4000-8000-000000000002', 'suspend', 'Spam', 0)$$,
  '22023', 'invalid_suspension', 'suspension length is validated'
);
select throws_ok(
  $$select public.moderate('user', 'bbbbbbbb-0000-4000-8000-000000000002', 'hide', 'nope')$$,
  '22023', 'invalid_action', 'users cannot be hidden'
);
select lives_ok(
  $$select public.moderate('user', 'bbbbbbbb-0000-4000-8000-000000000002', 'suspend', 'Repeated spam', 3)$$,
  'moderator suspends ben'
);
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select throws_ok($$select public.publish_post('tip', 'Back again')$$, 'PT403', 'suspended', 'suspended members cannot post');
select is(
  (public.my_account_status() ->> 'suspended_until') is not null,
  true,
  'account status reports the suspension'
);
select tests.login('dddddddd-0000-4000-8000-000000000004');
select lives_ok(
  $$select public.moderate('user', 'bbbbbbbb-0000-4000-8000-000000000002', 'unsuspend', 'Served')$$,
  'moderator lifts the suspension'
);
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select lives_ok($$select public.publish_post('tip', 'Back again')$$, 'ben can post again');

-- Moderators see held content; members do not.
select tests.login('dddddddd-0000-4000-8000-000000000004');
select is((select count(*)::integer from public.posts where status = 'hidden'), 1, 'moderators can read hidden posts');
select tests.login('cccccccc-0000-4000-8000-000000000003');
select is((select count(*)::integer from public.posts where status = 'hidden'), 0, 'members cannot read hidden posts');

-- Owners learn what was decided, never who decided it.
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select is((select count(*)::integer from public.moderation_actions), 0, 'owners cannot read the moderation log');
select is((select count(*)::integer from public.moderation_appeals), 0, 'appellants cannot read appeal rows');
select is(
  (select count(*)::integer from public.moderation_actions where moderator_id is not null),
  0,
  'the moderator id is not reachable through the table'
);
select ok((select count(*) from public.my_moderation_decisions()) >= 2, 'owners list decisions about their content');
select is(
  (select count(*)::integer from public.my_moderation_decisions() d
   where to_jsonb(d) ?| array['moderator_id', 'report_id', 'decided_by']),
  0,
  'the decision list leaves out the moderator, the report and the reviewer'
);
select is(
  (select appeal_status from public.my_moderation_decisions() where action = 'hide' and appeal_status is not null),
  'reversed'::public.appeal_status,
  'owners see the outcome of their appeal'
);

-- A reversal does not undo a newer decision: hide, appeal, remove, then reverse the hide.
select lives_ok(
  $$select public.appeal(
      (select action_id from public.my_moderation_decisions() where action = 'hide' and appealable),
      'This was not spam.')$$,
  'ana appeals the automatic hide'
);
select tests.login('dddddddd-0000-4000-8000-000000000004');
select lives_ok(
  $$select public.moderate('post', (select id::text from public.posts where title = 'Fine tip'), 'remove', 'Spam after all.')$$,
  'a later decision removes the post'
);
select lives_ok(
  $$select public.decide_appeal((select id from public.moderation_appeals where status = 'pending'), 'reversed')$$,
  'the older hide is reversed'
);
select is(
  (select status from public.posts where title = 'Fine tip'),
  'removed'::public.content_status,
  'the newer removal still stands'
);
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select is(
  (select count(*)::integer from public.notifications
   where kind = 'appeal_decision' and data ->> 'outcome' = 'reversed' and data ->> 'state_restored' = 'false'),
  1,
  'the appellant is told nothing was restored'
);

-- Appeals stay decidable after the author deletes the content.
select lives_ok($$select public.publish_post('tip', 'Short lived', 'Soon gone.')$$, 'ana posts once more');
select tests.login('dddddddd-0000-4000-8000-000000000004');
select lives_ok(
  $$select public.moderate('post', (select id::text from public.posts where title = 'Short lived'), 'hide', 'Off topic.')$$,
  'moderator hides it'
);
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.appeal(
      (select action_id from public.my_moderation_decisions() where action = 'hide' and appealable),
      'It is on topic.')$$,
  'ana appeals'
);
select lives_ok($$delete from public.posts where title = 'Short lived'$$, 'ana deletes the post');
select tests.login('dddddddd-0000-4000-8000-000000000004');
select lives_ok(
  $$select public.decide_appeal((select id from public.moderation_appeals where status = 'pending'), 'upheld')$$,
  'the appeal can still be decided'
);
select tests.login('aaaaaaaa-0000-4000-8000-000000000001');
select is(
  (select count(*)::integer from public.notifications
   where kind = 'appeal_decision' and data ->> 'outcome' = 'upheld' and post_id is null),
  1,
  'the outcome notice arrives without a link to the deleted post'
);

-- Conflicts of interest.
select tests.login('dddddddd-0000-4000-8000-000000000004');
select lives_ok($$select public.publish_post('tip', 'Moderator tip', 'Salt your pasta water.')$$, 'the moderator posts');
select throws_ok(
  $$select public.moderate('post', (select id::text from public.posts where title = 'Moderator tip'), 'hide', 'Self')$$,
  'PT403', 'forbidden', 'moderators cannot act on their own content'
);
reset role;
insert into public.user_roles (user_id, role) values ('eeeeeeee-0000-4000-8000-000000000005', 'admin');
set local role authenticated;
select tests.login('dddddddd-0000-4000-8000-000000000004');
select throws_ok(
  $$select public.moderate('user', 'eeeeeeee-0000-4000-8000-000000000005', 'suspend', 'Nope', 3)$$,
  'PT403', 'forbidden', 'admins cannot be suspended'
);

-- The queue pages with a keyset, including groups first reported at the same instant.
select tests.login('bbbbbbbb-0000-4000-8000-000000000002');
select lives_ok($$select public.report_content('user', 'aaaaaaaa-0000-4000-8000-000000000001', 'spam')$$, 'ben reports ana');
select lives_ok($$select public.report_content('recipe', 'mealdb:999', 'unsafe_food')$$, 'ben reports a recipe');
select tests.login('dddddddd-0000-4000-8000-000000000004');
select is(jsonb_array_length(public.moderation_queue() -> 'items'), 2, 'two targets are queued');
select is(
  jsonb_array_length(public.moderation_queue(p_limit => 1) -> 'items'),
  1,
  'the first page holds one target'
);
select isnt(public.moderation_queue(p_limit => 1) ->> 'next_cursor', null, 'a cursor points at the rest');
select is(
  (
    (public.moderation_queue(p_limit => 1) -> 'items' -> 0 ->> 'target_id')
    <> (public.moderation_queue(p_limit => 1, p_cursor => public.moderation_queue(p_limit => 1) ->> 'next_cursor')
          -> 'items' -> 0 ->> 'target_id')
  ),
  true,
  'the second page holds the other target'
);
select is(
  public.moderation_queue(p_limit => 1, p_cursor => public.moderation_queue(p_limit => 1) ->> 'next_cursor')
    ->> 'next_cursor',
  null,
  'and nothing follows it'
);
select throws_ok($$select public.moderation_queue(p_cursor => 'nonsense')$$, '22023', 'invalid_cursor', 'bad cursors are rejected');
reset role;

select * from finish();
rollback;
