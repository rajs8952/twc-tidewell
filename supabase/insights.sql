-- ============================================================
-- OmniWell Insights Engine, phase 1: daily wellness rollup.
-- Run AFTER schema.sql and wellness.sql. Paste into Supabase → SQL Editor → Run.
-- Safe to re-run.
--
-- One row per user per local calendar day that has at least one water,
-- sleep or mood entry, with:
--   date                 the user's local calendar day
--   total_water_ml       hydration that counts toward the goal (drink_logs.effective_ml)
--   total_sleep_minutes  sleep that ENDED that day (a night belongs to the day you woke up)
--   average_mood_score   mean of that day's check-ins, awful = 1 … great = 5
--
-- Missing data stays NULL, never 0: a day with water but no sleep log has
-- total_sleep_minutes = NULL, so "forgot to log" isn't mistaken for "didn't
-- sleep" and doesn't drag correlations down. Use the logged_* flags to filter.
-- ============================================================

-- ---------- Per-user timezone ----------
-- Timestamps are stored in UTC; "which day" depends on where the user lives.
-- The app should save the browser's zone here (Intl.DateTimeFormat().resolvedOptions().timeZone).
create or replace function public.is_valid_timezone(tz text)
returns boolean language plpgsql immutable as $$
begin
  perform '2000-01-01 00:00:00+00'::timestamptz at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;

alter table public.profiles add column if not exists timezone text not null default 'UTC';

alter table public.profiles drop constraint if exists profiles_timezone_valid;
alter table public.profiles add constraint profiles_timezone_valid check (public.is_valid_timezone(timezone));

-- ---------- The rollup ----------
-- Each source is aggregated to (user, day) on its own BEFORE joining.
-- Joining raw rows first would multiply sums: 3 drinks × 2 mood check-ins
-- would count every drink twice.
drop view if exists public.daily_wellness_rollup;

create view public.daily_wellness_rollup
with (security_invoker = true)  -- run as the caller, so each table's RLS applies: users see only their own rows
as
with tz as (
  select id as user_id, timezone from public.profiles
),
water as (
  select d.user_id,
         (d.logged_at at time zone coalesce(tz.timezone, 'UTC'))::date as day,
         sum(d.effective_ml)::bigint as total_water_ml
  from public.drink_logs d
  left join tz on tz.user_id = d.user_id
  group by 1, 2
),
sleep as (
  select s.user_id,
         (s.wake_at at time zone coalesce(tz.timezone, 'UTC'))::date as day,
         sum(s.duration_min)::bigint as total_sleep_minutes
  from public.sleep_logs s
  left join tz on tz.user_id = s.user_id
  group by 1, 2
),
mood as (
  select m.user_id,
         (m.logged_at at time zone coalesce(tz.timezone, 'UTC'))::date as day,
         round(avg(case m.mood_state
                     when 'awful' then 1
                     when 'bad'   then 2
                     when 'okay'  then 3
                     when 'good'  then 4
                     when 'great' then 5
                   end), 2) as average_mood_score
  from public.mood_logs m
  left join tz on tz.user_id = m.user_id
  group by 1, 2
),
days as (
  select user_id, day from water
  union
  select user_id, day from sleep
  union
  select user_id, day from mood
)
select d.user_id,
       d.day                                as date,
       w.total_water_ml,
       s.total_sleep_minutes,
       m.average_mood_score,
       (w.user_id is not null)              as logged_water,
       (s.user_id is not null)              as logged_sleep,
       (m.user_id is not null)              as logged_mood
from days d
left join water w on w.user_id = d.user_id and w.day = d.day
left join sleep s on s.user_id = d.user_id and s.day = d.day
left join mood  m on m.user_id = d.user_id and m.day = d.day;

comment on view public.daily_wellness_rollup is
  'One row per user per local day with any water, sleep or mood entry. Missing sources are NULL, not 0. RLS applies (security_invoker).';

revoke all on public.daily_wellness_rollup from anon;
grant select on public.daily_wellness_rollup to authenticated;
