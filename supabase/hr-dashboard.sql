-- ============================================================
-- OmniWell HR dashboard: anonymised, company-wide totals for HR and admins
-- (the /hr page). Run AFTER rbac-and-chat-media.sql, insights.sql and
-- sticky-queue.sql. Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
--   * A new role, 'hr': sees this dashboard only (no accounts, no chats,
--     no one's entries). Admins see it too.
--   * hr_dashboard() returns totals only, never a person, an entry or a
--     message. Any count of fewer than 5 people comes back as null (shown
--     as "fewer than 5"), so no one can be picked out. Averages are only
--     given when at least 5 people contributed.
-- ============================================================

-- The new role. (Compared as text below: a new enum value can't be used in
-- the same transaction that adds it.)
alter type public.app_role add value if not exists 'hr';

create or replace function public.can_view_hr_dashboard()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role::text in ('admin', 'hr'))
$$;

revoke all on function public.can_view_hr_dashboard() from public, anon;
grant execute on function public.can_view_hr_dashboard() to authenticated;

-- A count of people, or null when it's under the smallest group size (zero stays zero).
create or replace function public.nullif_small(n bigint, k integer)
returns bigint language sql immutable set search_path = ''
as $$ select case when n = 0 or n >= k then n end $$;

create or replace function public.hr_dashboard(p_weeks integer default 12, p_tz text default 'Asia/Kolkata')
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  k constant integer := 5;                       -- the smallest group ever shown
  tz text := case when public.is_valid_timezone(p_tz) then p_tz else 'UTC' end;
  n_weeks integer := least(greatest(coalesce(p_weeks, 12), 4), 26);
  this_week date := date_trunc('week', now() at time zone tz)::date;
  first_week date := this_week - (n_weeks - 1) * 7;
  since timestamptz := (first_week::timestamp at time zone tz);
  result jsonb;
begin
  if not public.can_view_hr_dashboard() then
    raise exception 'Only HR and admins can see the company dashboard.' using errcode = '42501';
  end if;

  with
  -- Employees: active accounts that use the app (not coaches, admins or HR).
  employees as (
    select u.id
    from auth.users u
    left join public.user_roles r on r.user_id = u.id
    where (r.role is null or r.role::text = 'user')
      and (u.banned_until is null or u.banned_until < now())
  ),
  -- Every tracker entry and every message an employee sent, with its local week.
  activity as (
    select user_id, logged_at as at, 'mood' as source from public.mood_logs where logged_at >= since
    union all select user_id, logged_at, 'water' from public.drink_logs where logged_at >= since
    union all select user_id, wake_at, 'sleep' from public.sleep_logs where wake_at >= since
    union all select user_id, logged_at, 'meditation' from public.meditation_logs where logged_at >= since
    union all select user_id, logged_at, 'exercise' from public.exercise_logs where logged_at >= since
    union all select user_id, logged_at, 'weight' from public.weight_logs where logged_at >= since
    union all
      select t.user_id, m.created_at, 'chat'
      from public.thread_messages m join public.therapist_threads t on t.id = m.thread_id
      where m.sender_role::text = 'user' and m.created_at >= since
  ),
  act as (
    select a.user_id, a.source, a.at, date_trunc('week', a.at at time zone tz)::date as wk
    from activity a join employees e on e.id = a.user_id
  ),
  weeks as (select generate_series(first_week, this_week, interval '7 days')::date as wk),
  weekly_active as (
    select w.wk, count(distinct a.user_id) as n
    from weeks w left join act a on a.wk = w.wk
    group by w.wk
  ),
  -- Mood and stress per week, from employees' check-ins.
  mood as (
    select date_trunc('week', m.logged_at at time zone tz)::date as wk,
           count(distinct m.user_id) as people,
           avg(case m.mood_state when 'awful' then 1 when 'bad' then 2 when 'okay' then 3 when 'good' then 4 when 'great' then 5 end) as avg_mood,
           avg(m.stress_level) as avg_stress,
           avg(case when m.mood_state in ('awful', 'bad') then 1.0 else 0.0 end) as low_share,
           count(*) as checkins
    from public.mood_logs m join employees e on e.id = m.user_id
    where m.logged_at >= since
    group by 1
  ),
  -- Conversations: when each started, and how long until a coach first replied.
  threads as (
    select t.id, t.team, t.status::text as status, t.user_id,
           date_trunc('week', t.created_at at time zone tz)::date as wk,
           t.created_at,
           (select min(m.created_at) from public.thread_messages m where m.thread_id = t.id and m.sender_role::text = 'user') as first_user_at
    from public.therapist_threads t
    where t.created_at >= since
  ),
  replies as (
    select th.*,
           (select min(m.created_at) from public.thread_messages m
             where m.thread_id = th.id and m.sender_role::text = 'therapist' and m.created_at >= th.first_user_at) as first_reply_at
    from threads th
  ),
  support_weekly as (
    select wk, team,
           count(*) as started,
           count(distinct user_id) as people,
           count(first_reply_at) as replied,
           percentile_cont(0.5) within group (order by extract(epoch from first_reply_at - first_user_at) / 3600.0)
             filter (where first_reply_at is not null) as median_hours,
           -- Answered within 24 h counts 1; answered later, or still waiting after 24 h, counts 0; too soon to tell is left out.
           avg(case when first_reply_at is not null then (case when first_reply_at - first_user_at <= interval '24 hours' then 1.0 else 0.0 end)
                    when now() - first_user_at > interval '24 hours' then 0.0 end) as within_24h
    from replies
    group by wk, team
  ),
  -- The last 30 days, per team.
  support_30 as (
    select team,
           count(*) as started,
           count(distinct user_id) as people,
           percentile_cont(0.5) within group (order by extract(epoch from first_reply_at - first_user_at) / 3600.0)
             filter (where first_reply_at is not null) as median_hours,
           -- Answered within 24 h counts 1; answered later, or still waiting after 24 h, counts 0; too soon to tell is left out.
           avg(case when first_reply_at is not null then (case when first_reply_at - first_user_at <= interval '24 hours' then 1.0 else 0.0 end)
                    when now() - first_user_at > interval '24 hours' then 0.0 end) as within_24h
    from replies
    where created_at >= now() - interval '30 days'
    group by team
  ),
  -- Open conversations whose newest message is the employee's and is over 24 hours old.
  overdue as (
    select t.team, count(*) as n
    from public.therapist_threads t
    join lateral (select m.sender_role::text as role, m.created_at from public.thread_messages m where m.thread_id = t.id order by m.created_at desc limit 1) last on true
    where t.status::text not in ('resolved', 'closed') and last.role = 'user' and last.created_at < now() - interval '24 hours'
    group by t.team
  ),
  adoption as (
    select s.source, count(distinct a.user_id) as n
    from (values ('water'), ('mood'), ('sleep'), ('exercise'), ('meditation'), ('weight')) s(source)
    left join act a on a.source = s.source and a.at >= now() - interval '30 days'
    group by s.source
  )
  select jsonb_build_object(
    'generated_at', now(),
    'timezone', tz,
    'min_group', k,
    'employees', (select count(*) from employees),
    'active_7d', (select public.nullif_small(count(distinct user_id), k) from act where at >= now() - interval '7 days'),
    'active_30d', (select public.nullif_small(count(distinct user_id), k) from act where at >= now() - interval '30 days'),
    'checkins_7d', (select case when count(distinct m.user_id) >= k then count(*) end from public.mood_logs m join employees e on e.id = m.user_id where m.logged_at >= now() - interval '7 days'),
    'weeks', (
      select jsonb_agg(jsonb_build_object(
        'week', w.wk,
        'active', public.nullif_small(w.n, k),
        'mood', (select case when mo.people >= k then jsonb_build_object('people', mo.people, 'avg_mood', round(mo.avg_mood, 2), 'avg_stress', round(mo.avg_stress, 2), 'low_share', round(mo.low_share, 3), 'checkins', mo.checkins) end
                 from mood mo where mo.wk = w.wk),
        'chats', (select jsonb_object_agg(sw.team, jsonb_build_object(
                    'started', case when sw.people >= k then sw.started end,
                    'median_hours', case when sw.replied >= k then round(sw.median_hours::numeric, 1) end,
                    'within_24h', case when sw.people >= k then round(sw.within_24h, 3) end))
                  from support_weekly sw where sw.wk = w.wk)
      ) order by w.wk)
      from weekly_active w
    ),
    'adoption', (select jsonb_object_agg(source, public.nullif_small(n, k)) from adoption),
    'support_30d', (select jsonb_object_agg(team, jsonb_build_object(
                      'started', case when people >= k then started end,
                      'median_hours', case when people >= k then round(median_hours::numeric, 1) end,
                      'within_24h', case when people >= k then round(within_24h, 3) end))
                    from support_30),
    -- Workload, not people: the number of overdue conversations is shown as it is.
    'overdue', coalesce((select jsonb_object_agg(team, n) from overdue), '{}'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.hr_dashboard(integer, text) from public, anon;
grant execute on function public.hr_dashboard(integer, text) to authenticated;
