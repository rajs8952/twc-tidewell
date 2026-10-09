-- ============================================================
-- OmniWell reminders that repeat through the day (e.g. water every 2 hours
-- from 09:00 to 21:00). Run AFTER notification-delivery.sql.
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
-- Each tracker's reminder is still one row in notification_schedules:
--   notify_time            the first (or only) reminder of the day
--   repeat_every_minutes   null = once a day; else repeat every N minutes (30–720)
--   end_time               with a repeat: the last time a reminder may be sent
-- The delivery job (claim_due_notifications) sends each occurrence once.
-- ============================================================

alter table public.notification_schedules add column if not exists repeat_every_minutes integer;
alter table public.notification_schedules add column if not exists end_time time;

alter table public.notification_schedules drop constraint if exists notification_schedules_repeat_valid;
alter table public.notification_schedules add constraint notification_schedules_repeat_valid check (
  repeat_every_minutes is null
  or (repeat_every_minutes between 30 and 720 and end_time is not null and end_time > notify_time)
);

-- Users may change these too (still only on their own rows, by the existing policies).
grant update (repeat_every_minutes, end_time) on public.notification_schedules to authenticated;

-- Which reminders are due right now, one row per device to push to.
--
-- Once a day (no repeat): due within p_window_minutes after notify_time, as before.
-- Repeating: occurrences fall at notify_time, +N, +2N, … up to end_time. The
-- latest occurrence that has passed today is due within the smaller of the
-- window and N (so a late cron run never sends two at once). Each occurrence
-- is sent once: last_sent_at is set in the same statement.
create or replace function public.claim_due_notifications(p_now timestamptz default now(), p_window_minutes integer default 60)
returns table (
  schedule_id      uuid,
  user_id          uuid,
  tracker_type     public.tracker_type,
  subscription_id  uuid,
  endpoint         text,
  p256dh           text,
  auth             text
)
language sql volatile security definer set search_path = ''
as $$
  with local_now as (
    select s.id, s.repeat_every_minutes as every,
           (extract(epoch from s.notify_time) / 60)::int as start_min,
           (extract(epoch from s.end_time) / 60)::int as end_min,
           floor(extract(epoch from (p_now at time zone coalesce(p.timezone, 'UTC'))::time) / 60)::int as now_min
    from public.notification_schedules s
    join public.profiles p on p.id = s.user_id
    where s.is_enabled
  ),
  timing as (
    select l.id,
           m.minutes_ago,
           p_now - make_interval(mins => m.minutes_ago) as due_at,
           case when l.every is null then greatest(1, least(p_window_minutes, 720))
                else greatest(1, least(p_window_minutes, l.every)) end as window_min
    from local_now l
    cross join lateral (
      select case
        -- Once a day: minutes since notify_time last came round (wraps past midnight).
        when l.every is null then (l.now_min - l.start_min + 1440) % 1440
        -- Repeating, before the first one today: nothing due.
        when l.now_min < l.start_min then null
        -- Repeating: minutes since the latest occurrence at or before now (and not after end_time).
        else l.now_min - (l.start_min + ((least(l.now_min, l.end_min) - l.start_min) / l.every) * l.every)
      end as minutes_ago
    ) m
    where m.minutes_ago is not null
  ),
  due as (
    update public.notification_schedules s
    set last_sent_at = p_now
    from timing t
    where t.id = s.id
      and t.minutes_ago < t.window_min
      -- not yet sent for this occurrence
      and (s.last_sent_at is null or s.last_sent_at < t.due_at - interval '1 minute')
    returning s.id, s.user_id, s.tracker_type
  )
  select d.id, d.user_id, d.tracker_type, ps.id, ps.endpoint, ps.p256dh, ps.auth
  from due d
  join public.push_subscriptions ps on ps.user_id = d.user_id
$$;

revoke all on function public.claim_due_notifications(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_due_notifications(timestamptz, integer) to service_role;
