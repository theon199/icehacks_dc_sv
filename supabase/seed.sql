-- Famara local development seed.
--
-- 1. The clearly labelled "Famara Team" account (always created).
-- 2. Seven starter kitchen tips posted by that account (opt-in, see below).
--
-- The tips are opt-in because the pgTAP feed tests run against the seeded database and assert on
-- exact feed contents. To add them to a local database, run this file again with the setting on:
--
--   PGOPTIONS='-c famara.starter_tips=on' psql \
--     "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seed.sql
--
-- The team account has no password and cannot be signed in to. Everything here is idempotent:
-- running it again leaves existing rows alone.

-- The team account. The new-user trigger creates its profile; staff then mark it as the team
-- account, which is what allows the reserved handle.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'f0000000-0000-4000-8000-00000000fa11',
  'authenticated',
  'authenticated',
  'team@famara.invalid',
  '',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"display_name": "Famara Team"}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

update public.profiles
set is_team = true,
    handle = 'famara_team',
    display_name = 'Famara Team',
    bio = 'Kitchen tips from the people who make Famara. Real members share everything else.'
where id = 'f0000000-0000-4000-8000-00000000fa11'
  and (not is_team or handle <> 'famara_team');

-- Starter kitchen tips, written for Famara. No likes, comments, follows or other engagement are
-- invented: counters start at zero and only real members change them. Skipped unless
-- `famara.starter_tips` is 'on' for this session, and skipped if the team account is missing.
do $starter_tips$
begin
  if coalesce(current_setting('famara.starter_tips', true), '') <> 'on' then
    return;
  end if;

    insert into public.posts (id, author_id, kind, title, body, created_at, updated_at)
    select v.id::uuid, v.author_id::uuid, v.kind::public.post_kind, v.title, v.body, v.created_at, v.created_at
    from (
      values
      (
        'f0000000-0000-4000-8000-0000000071a1',
        'f0000000-0000-4000-8000-00000000fa11',
        'tip',
        'Toast whole spices before you use them',
        'Warm cumin, coriander or fennel seeds in a dry pan for a minute, until they smell nutty, then grind or add them. The flavour gets deeper, so the dish needs less salt to taste complete.',
        now() - interval '6 days 3 hours',
        now() - interval '6 days 3 hours'
      ),
      (
        'f0000000-0000-4000-8000-0000000071a2',
        'f0000000-0000-4000-8000-00000000fa11',
        'tip',
        'Go half and half on grains',
        'Next time you cook rice for a curry or stir-fry, make half of it brown rice, bulgur or quinoa. It still tastes like the meal you know, with more fibre. Start the whole grain 10 to 15 minutes earlier so both finish together.',
        now() - interval '5 days 6 hours',
        now() - interval '5 days 6 hours'
      ),
      (
        'f0000000-0000-4000-8000-0000000071a3',
        'f0000000-0000-4000-8000-00000000fa11',
        'tip',
        'Let lentils share the pot with mince',
        'In chilli, bolognese or keema, swap about a third of the minced meat for cooked lentils or beans. They soak up the sauce, keep the texture hearty and add plant protein and fibre.',
        now() - interval '4 days 2 hours',
        now() - interval '4 days 2 hours'
      ),
      (
        'f0000000-0000-4000-8000-0000000071a4',
        'f0000000-0000-4000-8000-00000000fa11',
        'tip',
        'Finish with something sour',
        'A squeeze of lemon or lime, or a small splash of vinegar, stirred in right at the end wakes up soups, stews and braises. Try it before reaching for more salt.',
        now() - interval '3 days 5 hours',
        now() - interval '3 days 5 hours'
      ),
      (
        'f0000000-0000-4000-8000-0000000071a5',
        'f0000000-0000-4000-8000-00000000fa11',
        'tip',
        'Use yogurt where a recipe asks for cream',
        'Plain yogurt gives sauces a creamy finish with less saturated fat. Take the pan off the heat and stir a spoonful of the hot sauce into the yogurt first, then add it back, so it stays smooth instead of splitting.',
        now() - interval '2 days 8 hours',
        now() - interval '2 days 8 hours'
      ),
      (
        'f0000000-0000-4000-8000-0000000071a6',
        'f0000000-0000-4000-8000-00000000fa11',
        'tip',
        'Roast instead of deep-frying',
        'Potatoes, plantain, cauliflower and chickpeas crisp up well in a hot oven. Toss them in a spoonful of oil, spread them out so they do not steam, and turn them once halfway through.',
        now() - interval '1 day 9 hours',
        now() - interval '1 day 9 hours'
      ),
      (
        'f0000000-0000-4000-8000-0000000071a7',
        'f0000000-0000-4000-8000-00000000fa11',
        'tip',
        'Taste before you salt',
        'Stock cubes, soy sauce, fish sauce, cheese and cured meats already bring plenty of salt. Add them first, taste, and only then decide whether the dish needs more.',
        now() - interval '20 hours',
        now() - interval '20 hours'
      )
    ) as v (id, author_id, kind, title, body, created_at, updated_at)
    where exists (select 1 from public.profiles p where p.id = v.author_id::uuid and p.is_team)
    on conflict (id) do nothing;
end
$starter_tips$;
