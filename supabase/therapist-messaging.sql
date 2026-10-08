-- ⚠️  SUPERSEDED BY sticky-queue.sql: once that has run, do NOT re-run this
--     file. It would restore rules that use the old 'open'/'closed' statuses.
--     (Fresh setup: run this, then the later files, in order.)
-- ============================================================
-- OmniWell "Chat with a therapist", phase 1: asynchronous secure
-- messaging (an inbox, like a patient portal), not live chat.
-- Run AFTER schema.sql. Paste into Supabase → SQL Editor → Run.
-- Safe to re-run.
--
-- What signed-in users can do (row-level security):
--   therapist_threads  SELECT and INSERT their own threads only
--   thread_messages    SELECT messages in their own threads; INSERT only
--                      as sender_role 'user', only into their own open threads
-- No UPDATE or DELETE for users on either table: the conversation is a
-- permanent record. Therapist access comes in a later phase; until then
-- therapists' replies can only be written with the service role, which
-- bypasses RLS and must never reach the browser.
-- ============================================================

-- ---------- Types ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'message_sender_role' and typnamespace = 'public'::regnamespace) then
    create type public.message_sender_role as enum ('user', 'therapist');
  end if;
  if not exists (select 1 from pg_type where typname = 'therapist_thread_status' and typnamespace = 'public'::regnamespace) then
    create type public.therapist_thread_status as enum ('open', 'closed');
  end if;
end
$$;

-- ---------- Tables ----------
create table if not exists public.therapist_threads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status      public.therapist_thread_status not null default 'open',
  created_at  timestamptz not null default now()
);

create table if not exists public.thread_messages (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.therapist_threads (id) on delete cascade,
  sender_role  public.message_sender_role not null,
  content      text not null check (char_length(btrim(content)) between 1 and 4000),
  created_at   timestamptz not null default now()
);

create index if not exists therapist_threads_user_idx on public.therapist_threads (user_id, created_at desc);
create index if not exists thread_messages_thread_idx on public.thread_messages (thread_id, created_at);

-- ---------- Server-set columns ----------
-- Timestamps come from the database clock, never the client, so the
-- order of a conversation can't be faked.
create or replace function public.messaging_set_created_at()
returns trigger language plpgsql as $$
begin
  new.created_at = now();
  return new;
end;
$$;

drop trigger if exists therapist_threads_created_at on public.therapist_threads;
create trigger therapist_threads_created_at before insert on public.therapist_threads
  for each row execute procedure public.messaging_set_created_at();

drop trigger if exists thread_messages_created_at on public.thread_messages;
create trigger thread_messages_created_at before insert on public.thread_messages
  for each row execute procedure public.messaging_set_created_at();

-- ---------- Privileges ----------
-- Belt and braces under RLS: logged-out visitors get nothing, and signed-in
-- users can only read and add rows, never change or remove them.
revoke all on public.therapist_threads, public.thread_messages from anon;
revoke update, delete, truncate on public.therapist_threads, public.thread_messages from authenticated;
grant select, insert on public.therapist_threads, public.thread_messages to authenticated;

-- ---------- Row-level security ----------
alter table public.therapist_threads enable row level security;
alter table public.thread_messages enable row level security;
-- Applies RLS to the table owner too, so nothing but the service role skips it.
alter table public.therapist_threads force row level security;
alter table public.thread_messages force row level security;

drop policy if exists "threads_select_own" on public.therapist_threads;
drop policy if exists "threads_insert_own" on public.therapist_threads;
drop policy if exists "messages_select_own_threads" on public.thread_messages;
drop policy if exists "messages_insert_own_open_threads" on public.thread_messages;

-- (select auth.uid()) is evaluated once per query rather than once per row.
create policy "threads_select_own" on public.therapist_threads
  for select to authenticated
  using (user_id = (select auth.uid()));

-- New threads must be the caller's own and start open.
create policy "threads_insert_own" on public.therapist_threads
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open');

create policy "messages_select_own_threads" on public.thread_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.therapist_threads t
      where t.id = thread_messages.thread_id and t.user_id = (select auth.uid())
    )
  );

-- Users can only speak as themselves ('user', never 'therapist'), and only
-- in a thread they own that is still open.
create policy "messages_insert_own_open_threads" on public.thread_messages
  for insert to authenticated
  with check (
    sender_role = 'user'
    and exists (
      select 1 from public.therapist_threads t
      where t.id = thread_messages.thread_id and t.user_id = (select auth.uid()) and t.status = 'open'
    )
  );
