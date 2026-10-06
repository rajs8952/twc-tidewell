-- ============================================================
-- OmniWell notifications, delivery: which reminders are due right now.
-- Run AFTER notifications.sql (and insights.sql, for profiles.timezone).
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
-- Called every 15 minutes by the cron route (app/api/cron/notify/route.ts)
-- with the service role. Nobody else can call it.
-- ============================================================

-- Claims every reminder that's due and returns one row per device to push to.
--
-- Due means: enabled, the user's local time (profiles.timezone) is at or
-- after notify_time and within p_window_minutes of it, and it hasn't been
-- sent yet on the user's local today. The window lets a late or skipped cron
-- run still deliver; the once-a-day rule stops repeats.
--
-- "Claims" means last_sent_at is set in the same statement, so two cron runs
-- that overlap can't both send the same reminder. A reminder whose user has
-- no device subscribed is still claimed (and so skipped until tomorrow).
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
  with timing as (
    -- How many minutes ago this reminder's time last came round in the user's
    -- timezone (0–1439; wraps past midnight), and so the exact moment it was due.
    select s.id,
           m.minutes_ago,
           p_now - make_interval(mins => m.minutes_ago) as due_at
    from public.notification_schedules s
    join public.profiles p on p.id = s.user_id
    cross join lateral (
      select (floor(extract(epoch from ((p_now at time zone coalesce(p.timezone, 'UTC'))::time - s.notify_time)) / 60)::int + 1440) % 1440 as minutes_ago
    ) m
    where s.is_enabled
  ),
  due as (
    update public.notification_schedules s
    set last_sent_at = p_now
    from timing t
    where t.id = s.id
      and t.minutes_ago < greatest(1, least(p_window_minutes, 720))
      -- not yet sent for this occurrence (compared with the exact moment it fell due,
      -- so an 23:30 reminder isn't sent again just after midnight)
      and (s.last_sent_at is null or s.last_sent_at < t.due_at - interval '1 minute')
    returning s.id, s.user_id, s.tracker_type
  )
  select d.id, d.user_id, d.tracker_type, ps.id, ps.endpoint, ps.p256dh, ps.auth
  from due d
  join public.push_subscriptions ps on ps.user_id = d.user_id
$$;

revoke all on function public.claim_due_notifications(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_due_notifications(timestamptz, integer) to service_role;
