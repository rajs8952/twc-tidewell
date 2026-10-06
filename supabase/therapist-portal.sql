-- ============================================================
-- OmniWell wellness-team portal: therapists and dietitians read the
-- conversations for their team and reply.
-- Run AFTER therapist-messaging.sql (and again after any re-run of it,
-- since that file resets privileges). Paste into Supabase → SQL Editor → Run.
-- Safe to re-run; existing threads and staff become the 'therapist' team.
--
-- Teams: every conversation belongs to one team ('therapist' or
-- 'dietitian'), chosen by the employee when they start it. Every staff
-- member belongs to one team and only ever sees that team's conversations,
-- so dietitians can't read therapy conversations and vice versa.
--
-- Who is staff: a row in public.therapists (the table name predates
-- dietitians). Only an admin can add one (SQL Editor or service role):
--
--   insert into public.therapists (user_id, display_name, team)
--   select id, 'Dr Asha Rao', 'therapist' from auth.users where email = 'therapist@example.com';
--
--   insert into public.therapists (user_id, display_name, team)
--   select id, 'Priya Nair', 'dietitian' from auth.users where email = 'dietitian@example.com';
--
-- What staff can do, within their own team (shared queue per team): read
-- every thread and message, reply into open threads, and close or reopen
-- threads. Replies are stored with sender_role 'therapist', which means
-- "wellness staff"; the thread's team says which kind. Employees' rules
-- are unchanged.
-- ============================================================

-- ---------- Teams ----------
alter table public.therapist_threads add column if not exists team text not null default 'therapist';
alter table public.therapist_threads drop constraint if exists therapist_threads_team_valid;
alter table public.therapist_threads add constraint therapist_threads_team_valid check (team in ('therapist', 'dietitian'));
create index if not exists therapist_threads_team_idx on public.therapist_threads (team, status, created_at desc);

-- ---------- Staff ----------
create table if not exists public.therapists (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '' check (char_length(display_name) <= 120),
  created_at    timestamptz not null default now()
);
alter table public.therapists add column if not exists team text not null default 'therapist';
alter table public.therapists drop constraint if exists therapists_team_valid;
alter table public.therapists add constraint therapists_team_valid check (team in ('therapist', 'dietitian'));

alter table public.therapists enable row level security;
alter table public.therapists force row level security;
revoke all on public.therapists from anon, authenticated;
grant select on public.therapists to authenticated;

drop policy if exists "therapists_select_self" on public.therapists;
create policy "therapists_select_self" on public.therapists
  for select to authenticated
  using (user_id = (select auth.uid()));

-- The caller's team ('therapist' or 'dietitian'), or null for employees.
-- SECURITY DEFINER so policies can call it without granting anyone wider
-- access to the staff table.
create or replace function public.staff_team()
returns text
language sql stable security definer set search_path = ''
as $$
  select team from public.therapists where user_id = (select auth.uid())
$$;

-- True for any wellness staff member (either team).
create or replace function public.is_therapist()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.therapists where user_id = (select auth.uid()))
$$;

revoke all on function public.staff_team() from public, anon;
revoke all on function public.is_therapist() from public, anon;
grant execute on function public.staff_team() to authenticated;
grant execute on function public.is_therapist() to authenticated;

-- ---------- Who wrote each message ----------
-- Records the author of every message (audit trail: which staff member
-- replied). Always set from the session, so it can't be spoofed.
alter table public.thread_messages add column if not exists sender_id uuid references auth.users (id) on delete set null;

create or replace function public.messaging_set_sender()
returns trigger language plpgsql as $$
begin
  new.sender_id = auth.uid();
  return new;
end;
$$;

drop trigger if exists thread_messages_sender on public.thread_messages;
create trigger thread_messages_sender before insert on public.thread_messages
  for each row execute procedure public.messaging_set_sender();

-- ---------- Staff policies (own team only) ----------
-- Staff may change a thread's status, and nothing else about it.
grant update (status) on public.therapist_threads to authenticated;

drop policy if exists "threads_select_therapist" on public.therapist_threads;
drop policy if exists "threads_update_therapist" on public.therapist_threads;
drop policy if exists "messages_select_therapist" on public.thread_messages;
drop policy if exists "messages_insert_therapist" on public.thread_messages;

create policy "threads_select_therapist" on public.therapist_threads
  for select to authenticated
  using (team = (select public.staff_team()));

create policy "threads_update_therapist" on public.therapist_threads
  for update to authenticated
  using (team = (select public.staff_team()))
  with check (team = (select public.staff_team()));

create policy "messages_select_therapist" on public.thread_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.therapist_threads t
      where t.id = thread_messages.thread_id and t.team = (select public.staff_team())
    )
  );

create policy "messages_insert_therapist" on public.thread_messages
  for insert to authenticated
  with check (
    sender_role = 'therapist'
    and exists (
      select 1 from public.therapist_threads t
      where t.id = thread_messages.thread_id and t.status = 'open' and t.team = (select public.staff_team())
    )
  );

-- ---------- The staff queue ----------
-- One row per conversation in the caller's team, with who it's from and
-- where it stands. Employees' profiles stay private: this exposes only the
-- name and email of people who have written in, and only to that team.
-- Dropped first because its columns changed (team added).
drop function if exists public.therapist_queue(uuid);

create function public.therapist_queue(p_thread_id uuid default null)
returns table (
  thread_id          uuid,
  team               text,
  status             public.therapist_thread_status,
  created_at         timestamptz,
  user_id            uuid,
  user_name          text,
  user_email         text,
  message_count      integer,
  last_message_at    timestamptz,
  last_sender_role   public.message_sender_role,
  last_message       text,
  waiting_since      timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  my_team text := public.staff_team();
begin
  if my_team is null then
    raise exception 'Only wellness staff can view the queue.' using errcode = '42501';
  end if;

  return query
  select
    t.id,
    t.team,
    t.status,
    t.created_at,
    t.user_id,
    coalesce(nullif(p.full_name, ''), 'Employee')::text,
    u.email::text,
    coalesce(s.n, 0)::integer,
    last.created_at,
    last.sender_role,
    left(last.content, 160),
    -- When the employee started waiting: their first message after the last staff reply.
    case when last.sender_role = 'user' then (
      select min(m.created_at) from public.thread_messages m
      where m.thread_id = t.id and m.sender_role = 'user'
        and m.created_at > coalesce((select max(r.created_at) from public.thread_messages r where r.thread_id = t.id and r.sender_role = 'therapist'), '-infinity')
    ) end
  from public.therapist_threads t
  left join public.profiles p on p.id = t.user_id
  left join auth.users u on u.id = t.user_id
  left join lateral (select count(*) as n from public.thread_messages m where m.thread_id = t.id) s on true
  left join lateral (
    select m.created_at, m.sender_role, m.content from public.thread_messages m
    where m.thread_id = t.id order by m.created_at desc, m.id desc limit 1
  ) last on true
  where t.team = my_team and (p_thread_id is null or t.id = p_thread_id)
  order by (t.status = 'open') desc, (last.sender_role = 'user') desc, coalesce(last.created_at, t.created_at) asc
  limit 200;
end;
$$;

revoke all on function public.therapist_queue(uuid) from public, anon;
grant execute on function public.therapist_queue(uuid) to authenticated;
