-- Post badges count shared posts only, and a post held for review earns them once it is shown.
--
-- A post that moderation holds is not visible to anyone, so it should not count towards
-- post-count badges. When a moderator restores it or an appeal reverses the hold, the post becomes
-- visible and badges are evaluated again. Awards are idempotent (badge_awards has one row per user
-- and badge), so re-evaluating never grants or notifies twice.

-- Badge inputs. Cook-based metrics only use cooks logged live (see private.streaks), so a member
-- cannot earn streak or count badges by back-filling a month of history in one sitting. Only
-- visible posts count: a post held for review has not been shared with anyone yet.
create or replace function private.badge_metrics(p_user uuid)
returns table (cook_count integer, streak_days integer, cuisine_count integer, post_count integer)
language sql
stable
set search_path = ''
as $$
  with live as (
    select e.cuisine
    from public.cook_events e
    where e.user_id = p_user
      and e.created_at - e.cooked_at <= interval '2 days'
  )
  select
    (select count(*)::integer from live),
    (select s.longest_streak from private.streaks(p_user, (now() at time zone 'utc')::date, true) s),
    (select count(distinct l.cuisine)::integer from live l where l.cuisine is not null),
    (select count(*)::integer from public.posts p where p.author_id = p_user and p.status = 'visible');
$$;

-- Only a change into 'visible' re-evaluates; edits to a post that is already visible do not.
create trigger posts_award_badges_on_visible
  after update of status on public.posts
  for each row
  when (old.status <> 'visible' and new.status = 'visible')
  execute function private.posts_award_badges();
