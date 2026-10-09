-- ============================================================
-- OmniWell coach alerts: in-app notifications.
-- Run AFTER sticky-routing.sql. Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
-- Rows are written only by the server (the routing server actions in
-- apps/web/app/actions/routing.ts, using the service role) when a coach
-- receives a query: routed straight to them, or new in their team's pool.
-- Each person can read their own notifications and mark them read; nobody
-- can write notifications for anyone else from the browser.
--
-- Messages stay generic ("A new therapist query is in the pool") so no
-- health details are stored here or shown in a notification list.
-- ============================================================

create table if not exists public.in_app_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  message     text not null check (char_length(message) between 1 and 500),
  -- Optional: the conversation it's about, so the bell can open it.
  thread_id   uuid references public.therapist_threads (id) on delete cascade,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists in_app_notifications_user_unread
  on public.in_app_notifications (user_id, is_read, created_at desc);
create index if not exists in_app_notifications_thread
  on public.in_app_notifications (thread_id);

alter table public.in_app_notifications enable row level security;

revoke all on public.in_app_notifications from anon;
revoke all on public.in_app_notifications from authenticated;
grant select, delete on public.in_app_notifications to authenticated;
-- Users may only flip is_read; message, owner and thread are fixed.
grant update (is_read) on public.in_app_notifications to authenticated;

drop policy if exists "notifications_select_own" on public.in_app_notifications;
drop policy if exists "notifications_update_own" on public.in_app_notifications;
drop policy if exists "notifications_delete_own" on public.in_app_notifications;

create policy "notifications_select_own" on public.in_app_notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notifications_update_own" on public.in_app_notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "notifications_delete_own" on public.in_app_notifications for delete to authenticated
  using (user_id = (select auth.uid()));
-- No insert policy: only the service role (which bypasses RLS) creates notifications.
