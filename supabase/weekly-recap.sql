-- ============================================================
-- OmniWell weekly recap notification: "Your week in OmniWell is ready",
-- Monday mornings at 9 in each person's own timezone.
-- Run AFTER notification-repeat.sql. Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
--   weekly_recap          on/off (Profile → Reminders); on by default
--   weekly_recap_sent_at  when it was last sent, so it goes once a week
--
-- claim_weekly_recaps() is called every 15 minutes by the reminder cron
-- (app/api/cron/notify) with the service role, like claim_due_notifications().
-- ============================================================

alter table public.profiles add column if not exists weekly_recap boolean not null default true;
alter table public.profiles add column if not exists weekly_recap_sent_at timestamptz;

-- Everyone due their recap right now (Monday, 09:00–11:59 local, not sent in
-- the last 6 days, with a device to send to), claimed in the same statement
-- so overlapping cron runs can't both send it. One row per device.
create or replace function public.claim_weekly_recaps(p_now timestamptz default now())
returns table (user_id uuid, subscription_id uuid, endpoint text, p256dh text, auth text)
language sql volatile security definer set search_path = ''
as $$
  with due as (
    update public.profiles p
    set weekly_recap_sent_at = p_now
    where p.weekly_recap
      and extract(isodow from (p_now at time zone coalesce(p.timezone, 'UTC'))) = 1
      and extract(hour from (p_now at time zone coalesce(p.timezone, 'UTC'))) between 9 and 11
      and (p.weekly_recap_sent_at is null or p.weekly_recap_sent_at < p_now - interval '6 days')
      and exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
    returning p.id
  )
  select d.id, ps.id, ps.endpoint, ps.p256dh, ps.auth
  from due d
  join public.push_subscriptions ps on ps.user_id = d.id
$$;

revoke all on function public.claim_weekly_recaps(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_weekly_recaps(timestamptz) to service_role;
