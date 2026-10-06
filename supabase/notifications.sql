-- ============================================================
-- OmniWell notifications, phase 3.1: push subscriptions and reminder schedules.
-- Run AFTER schema.sql. Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
--   push_subscriptions      one row per device/browser that allowed notifications
--   notification_schedules  one row per user per tracker: on/off and the local time
--
-- Users can only see and manage their own rows (row-level security).
-- Delivery (the cron job that sends pushes) comes in the next phase; it will
-- run with the service role and read notify_time in the user's
-- profiles.timezone.
-- ============================================================

-- ---------- Tracker types ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tracker_type' and typnamespace = 'public'::regnamespace) then
    create type public.tracker_type as enum ('water', 'sleep', 'mood', 'meditation', 'exercise', 'weight');
  end if;
end
$$;

-- ---------- Push subscriptions ----------
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The push service URL for this browser; unique, as one device belongs to one user at a time.
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 2048),
  -- The browser's public key and auth secret, used to encrypt each push.
  p256dh      text not null check (char_length(p256dh) between 20 and 200),
  auth        text not null check (char_length(auth) between 8 and 100),
  user_agent  text check (char_length(user_agent) <= 400),
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;
revoke all on public.push_subscriptions from anon;
revoke update, truncate on public.push_subscriptions from authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

drop policy if exists "push_select_own" on public.push_subscriptions;
drop policy if exists "push_insert_own" on public.push_subscriptions;
drop policy if exists "push_delete_own" on public.push_subscriptions;
create policy "push_select_own" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "push_insert_own" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push_delete_own" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Saves this browser's subscription for the caller. If the same browser was
-- subscribed by someone else (a shared device), it moves to the caller, so the
-- previous user stops receiving this person's reminders. SECURITY DEFINER only
-- so it can remove that other user's row; it never reads or returns it.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> me;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (me, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 400))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- ---------- Notification schedules ----------
-- The reminder time each tracker starts with.
create or replace function public.default_notify_time(t public.tracker_type)
returns time
language sql immutable
as $$
  select case t
    when 'water'      then time '09:00'
    when 'weight'     then time '07:30'
    when 'meditation' then time '07:00'
    when 'mood'       then time '18:00'
    when 'exercise'   then time '17:30'
    when 'sleep'      then time '20:00'
  end
$$;

create table if not exists public.notification_schedules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tracker_type  public.tracker_type not null,
  is_enabled    boolean not null default true,
  -- Local time in the user's profiles.timezone; filled from default_notify_time() when omitted.
  notify_time   time not null,
  -- For the delivery job: when this reminder was last sent, so it sends once a day.
  last_sent_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, tracker_type)
);

-- A column default can't depend on another column, so the per-tracker default time is set here.
create or replace function public.notification_schedules_defaults()
returns trigger language plpgsql as $$
begin
  if new.notify_time is null then
    new.notify_time := public.default_notify_time(new.tracker_type);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists notification_schedules_defaults on public.notification_schedules;
create trigger notification_schedules_defaults before insert or update on public.notification_schedules
  for each row execute procedure public.notification_schedules_defaults();

alter table public.notification_schedules enable row level security;
alter table public.notification_schedules force row level security;
revoke all on public.notification_schedules from anon;
grant select, insert, update, delete on public.notification_schedules to authenticated;
-- Users choose on/off and the time; the delivery job's bookkeeping is off limits.
revoke update on public.notification_schedules from authenticated;
grant update (is_enabled, notify_time) on public.notification_schedules to authenticated;

drop policy if exists "schedules_select_own" on public.notification_schedules;
drop policy if exists "schedules_insert_own" on public.notification_schedules;
drop policy if exists "schedules_update_own" on public.notification_schedules;
drop policy if exists "schedules_delete_own" on public.notification_schedules;
create policy "schedules_select_own" on public.notification_schedules
  for select to authenticated using (user_id = (select auth.uid()));
create policy "schedules_insert_own" on public.notification_schedules
  for insert to authenticated with check (user_id = (select auth.uid()) and last_sent_at is null);
create policy "schedules_update_own" on public.notification_schedules
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "schedules_delete_own" on public.notification_schedules
  for delete to authenticated using (user_id = (select auth.uid()));
