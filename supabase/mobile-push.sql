-- ============================================================
-- OmniWell mobile app push notifications (Expo push).
-- Run AFTER weekly-recap.sql. Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
--   mobile_push_tokens        each phone's Expo push token, saved by the app
--   claim_due_reminders()     like claim_due_notifications(), but returns every
--                             due reminder (not only people with a browser
--                             subscription), so phone-only people get theirs
--   claim_weekly_recap_users() like claim_weekly_recaps(), for anyone with a
--                             browser subscription or a phone
--   claim_reply_notification() a coach's reply: who to notify, at most once
--                             every 5 minutes per conversation
--
-- The website's reminder job (apps/web/app/api/cron/notify) uses these when
-- present and the older functions otherwise, so the order of deploying the
-- website and running this file doesn't matter.
-- ============================================================

-- ---------- Phones ----------
create table if not exists public.mobile_push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Expo's address for this phone; one phone belongs to one person at a time.
  token       text not null unique check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$' and char_length(token) <= 200),
  platform    text not null check (platform in ('ios', 'android')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists mobile_push_tokens_user_idx on public.mobile_push_tokens (user_id);

alter table public.mobile_push_tokens enable row level security;
alter table public.mobile_push_tokens force row level security;
revoke all on public.mobile_push_tokens from anon;
revoke insert, update, truncate on public.mobile_push_tokens from authenticated;
grant select, delete on public.mobile_push_tokens to authenticated;

drop policy if exists "mobile_push_select_own" on public.mobile_push_tokens;
drop policy if exists "mobile_push_delete_own" on public.mobile_push_tokens;
create policy "mobile_push_select_own" on public.mobile_push_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy "mobile_push_delete_own" on public.mobile_push_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

-- Saves this phone's token for the caller. If the phone was used by someone
-- else before (a shared phone), it moves to the caller, so the previous person
-- stops getting this person's notifications. SECURITY DEFINER only so it can
-- move that row; it never reads or returns anyone else's data.
create or replace function public.save_mobile_push_token(p_token text, p_platform text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  insert into public.mobile_push_tokens (user_id, token, platform)
  values ((select auth.uid()), p_token, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

revoke all on function public.save_mobile_push_token(text, text) from public, anon;
grant execute on function public.save_mobile_push_token(text, text) to authenticated;

-- ---------- Reminders ----------
-- The same timing as claim_due_notifications() (notification-repeat.sql), but
-- one row per due reminder; the job then sends to each of that person's
-- browsers and phones. Each occurrence is claimed once (last_sent_at).
create or replace function public.claim_due_reminders(p_now timestamptz default now(), p_window_minutes integer default 60)
returns table (schedule_id uuid, user_id uuid, tracker_type public.tracker_type)
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
  )
  update public.notification_schedules s
  set last_sent_at = p_now
  from timing t
  where t.id = s.id
    and t.minutes_ago < t.window_min
    -- not yet sent for this occurrence
    and (s.last_sent_at is null or s.last_sent_at < t.due_at - interval '1 minute')
  returning s.id, s.user_id, s.tracker_type
$$;

revoke all on function public.claim_due_reminders(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(timestamptz, integer) to service_role;

-- ---------- Weekly recap ----------
-- Monday 09:00–11:59 local, once a week, for anyone with a browser or a phone.
create or replace function public.claim_weekly_recap_users(p_now timestamptz default now())
returns table (user_id uuid)
language sql volatile security definer set search_path = ''
as $$
  update public.profiles p
  set weekly_recap_sent_at = p_now
  where p.weekly_recap
    and extract(isodow from (p_now at time zone coalesce(p.timezone, 'UTC'))) = 1
    and extract(hour from (p_now at time zone coalesce(p.timezone, 'UTC'))) between 9 and 11
    and (p.weekly_recap_sent_at is null or p.weekly_recap_sent_at < p_now - interval '6 days')
    and (
      exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
      or exists (select 1 from public.mobile_push_tokens m where m.user_id = p.id)
    )
  returning p.id
$$;

revoke all on function public.claim_weekly_recap_users(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_weekly_recap_users(timestamptz) to service_role;

-- ---------- A coach's reply ----------
alter table public.therapist_threads add column if not exists employee_notified_at timestamptz;

-- Called by the website as the coach who just replied. Only staff of the
-- conversation's team can claim it, and only if they sent a reply in it in the
-- last 10 minutes;
-- at most once every 5 minutes per conversation, so a burst of replies sends
-- one notification. Returns the employee and the team, or nothing.
create or replace function public.claim_reply_notification(p_thread uuid)
returns table (user_id uuid, team text)
language sql volatile security definer set search_path = ''
as $$
  update public.therapist_threads t
  set employee_notified_at = now()
  where t.id = p_thread
    and t.team::text = public.staff_team()::text
    and (t.employee_notified_at is null or t.employee_notified_at < now() - interval '5 minutes')
    and exists (
      select 1 from public.thread_messages m
      where m.thread_id = t.id and m.sender_role::text = 'therapist' and m.sender_id = (select auth.uid())
        and m.created_at > now() - interval '10 minutes'
    )
  returning t.user_id, t.team::text
$$;

revoke all on function public.claim_reply_notification(uuid) from public, anon;
grant execute on function public.claim_reply_notification(uuid) to authenticated;

-- Check: the table and four functions should be listed.
select 'mobile_push_tokens' as name, to_regclass('public.mobile_push_tokens') is not null as ok
union all select p.proname, true from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('save_mobile_push_token', 'claim_due_reminders', 'claim_weekly_recap_users', 'claim_reply_notification');
