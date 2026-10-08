-- ============================================================
-- OmniWell "Sticky Queue", phase 1: schema for capacity and sticky routing.
-- Run AFTER therapist-messaging.sql, therapist-portal.sql and
-- rbac-and-chat-media.sql. Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
-- DEPLOY THE APP FIRST: this changes thread statuses from open/closed to
-- unassigned/in_progress/resolved. The app version that understands both
-- must be live before this runs.
--
--   1. coach_profiles     category, accepting-new, capacity and live load per coach.
--                         Mirrors public.therapists (which the admin portal and
--                         chat security use) automatically.
--   2. profiles           + preferred_therapist_id / preferred_dietitian_id
--                         (set by routing only; users can't change them).
--   3. therapist_threads  status → unassigned / in_progress / resolved,
--                         + category_needed (kept equal to team), + assigned_coach_id.
--                         Existing data is migrated, not lost.
--   4. Triggers           a coach's current_load is recalculated whenever their
--                         threads change; assigning beyond max_capacity is refused.
-- ============================================================

-- ---------- Types ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'coach_category' and typnamespace = 'public'::regnamespace) then
    create type public.coach_category as enum ('dietitian', 'therapist');
  end if;
  if not exists (select 1 from pg_type where typname = 'thread_status' and typnamespace = 'public'::regnamespace) then
    create type public.thread_status as enum ('unassigned', 'in_progress', 'resolved');
  end if;
end
$$;

-- ============================================================
-- 1. Coach profiles
-- ============================================================
create table if not exists public.coach_profiles (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  category          public.coach_category not null,
  is_accepting_new  boolean not null default true,
  max_capacity      integer not null default 10 check (max_capacity between 0 and 500),
  -- Maintained by triggers only: the coach's threads with status 'in_progress'.
  current_load      integer not null default 0 check (current_load >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Every existing therapist/dietitian gets a coach profile.
insert into public.coach_profiles (user_id, category)
select t.user_id, t.team::public.coach_category from public.therapists t
on conflict (user_id) do update set category = excluded.category;

-- Keep coach_profiles in step with public.therapists (written by the admin portal).
create or replace function public.sync_coach_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.coach_profiles where user_id = old.user_id;
    return old;
  end if;
  insert into public.coach_profiles (user_id, category)
  values (new.user_id, new.team::public.coach_category)
  on conflict (user_id) do update set category = excluded.category, updated_at = now();
  return new;
end;
$$;

drop trigger if exists therapists_sync_coach_profile on public.therapists;
create trigger therapists_sync_coach_profile after insert or update of team or delete on public.therapists
  for each row execute procedure public.sync_coach_profile();

alter table public.coach_profiles enable row level security;
revoke all on public.coach_profiles from anon;
revoke insert, delete, truncate on public.coach_profiles from authenticated;
grant select on public.coach_profiles to authenticated;
-- current_load is never writable by users; the guard below limits the rest.
revoke update on public.coach_profiles from authenticated;
grant update (is_accepting_new, max_capacity) on public.coach_profiles to authenticated;

drop policy if exists "coach_profiles_select" on public.coach_profiles;
drop policy if exists "coach_profiles_update" on public.coach_profiles;
-- A coach sees their own profile; admins see all.
create policy "coach_profiles_select" on public.coach_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "coach_profiles_update" on public.coach_profiles for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));

-- Coaches may only switch "accepting new" on or off; capacity is for admins.
create or replace function public.coach_profiles_guard()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if (select auth.uid()) is not null and not public.is_admin() and new.max_capacity is distinct from old.max_capacity then
    raise exception 'Only admins can change a coach''s capacity.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists coach_profiles_guard on public.coach_profiles;
create trigger coach_profiles_guard before update on public.coach_profiles
  for each row execute procedure public.coach_profiles_guard();

-- ============================================================
-- 2. Preferred coaches on profiles
-- ============================================================
alter table public.profiles add column if not exists preferred_therapist_id uuid references auth.users (id) on delete set null;
alter table public.profiles add column if not exists preferred_dietitian_id uuid references auth.users (id) on delete set null;

-- Set by routing (which turns on omniwell.routing for its transaction), never
-- by the user: otherwise anyone could route their chats to a coach of their choosing.
create or replace function public.profiles_guard_preferred()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('omniwell.routing', true), '') <> 'on'
     and (select auth.uid()) is not null
     and (new.preferred_therapist_id is distinct from old.preferred_therapist_id
          or new.preferred_dietitian_id is distinct from old.preferred_dietitian_id) then
    raise exception 'Preferred coaches are set by OmniWell, not edited directly.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_preferred on public.profiles;
create trigger profiles_guard_preferred before update on public.profiles
  for each row execute procedure public.profiles_guard_preferred();

-- ============================================================
-- 3. Threads: category, assignment and the new statuses
-- ============================================================
alter table public.therapist_threads add column if not exists assigned_coach_id uuid references public.coach_profiles (user_id) on delete set null;
alter table public.therapist_threads add column if not exists category_needed public.coach_category;
update public.therapist_threads set category_needed = team::public.coach_category where category_needed is null;
alter table public.therapist_threads alter column category_needed set not null;
create index if not exists therapist_threads_assigned_idx on public.therapist_threads (assigned_coach_id, status);

-- category_needed always equals team (team stays for the existing chat security).
create or replace function public.threads_sync_category()
returns trigger language plpgsql as $$
begin
  new.category_needed := new.team::public.coach_category;
  return new;
end;
$$;

drop trigger if exists threads_sync_category on public.therapist_threads;
create trigger threads_sync_category before insert or update of team, category_needed on public.therapist_threads
  for each row execute procedure public.threads_sync_category();

-- Convert open/closed to unassigned/in_progress/resolved (once).
do $$
begin
  if (select atttypid::regtype::text from pg_attribute
      where attrelid = 'public.therapist_threads'::regclass and attname = 'status') = 'therapist_thread_status' then

    -- Policies that mention status block the type change; they're recreated below.
    drop policy if exists "threads_insert_own" on public.therapist_threads;
    drop policy if exists "messages_insert_own_open_threads" on public.thread_messages;
    drop policy if exists "messages_insert_therapist" on public.thread_messages;
    drop function if exists public.therapist_queue(uuid);

    -- Sticky history: an existing thread belongs to the last coach (of its team) who replied.
    update public.therapist_threads t
    set assigned_coach_id = last.sender_id
    from (
      select distinct on (m.thread_id) m.thread_id, m.sender_id
      from public.thread_messages m
      join public.therapist_threads th on th.id = m.thread_id
      join public.coach_profiles c on c.user_id = m.sender_id and c.category::text = th.team
      where m.sender_role = 'therapist'
      order by m.thread_id, m.created_at desc
    ) last
    where last.thread_id = t.id and t.assigned_coach_id is null;

    alter table public.therapist_threads alter column status drop default;
    alter table public.therapist_threads alter column status type public.thread_status using (
      case
        when status::text = 'closed' then 'resolved'
        when assigned_coach_id is not null then 'in_progress'
        else 'unassigned'
      end
    )::public.thread_status;
    alter table public.therapist_threads alter column status set default 'unassigned';
    drop type if exists public.therapist_thread_status;
  end if;
end
$$;

-- In progress means someone is assigned; unassigned means nobody is.
alter table public.therapist_threads drop constraint if exists therapist_threads_assignment;
alter table public.therapist_threads add constraint therapist_threads_assignment check (
  status = 'resolved'
  or (status = 'in_progress' and assigned_coach_id is not null)
  or (status = 'unassigned' and assigned_coach_id is null)
);

-- Sticky routing starts from history: each user's most recent coach per category.
-- (Runs as the SQL Editor's admin role, which the preferred-coach guard allows.)
update public.profiles p set preferred_therapist_id = x.coach
from (
  select distinct on (user_id) user_id, assigned_coach_id as coach from public.therapist_threads
  where team = 'therapist' and assigned_coach_id is not null order by user_id, created_at desc
) x
where x.user_id = p.id and p.preferred_therapist_id is null;
update public.profiles p set preferred_dietitian_id = x.coach
from (
  select distinct on (user_id) user_id, assigned_coach_id as coach from public.therapist_threads
  where team = 'dietitian' and assigned_coach_id is not null order by user_id, created_at desc
) x
where x.user_id = p.id and p.preferred_dietitian_id is null;

-- ---------- Policies, updated for the new statuses ----------
drop policy if exists "threads_insert_own" on public.therapist_threads;
drop policy if exists "messages_insert_own_open_threads" on public.thread_messages;
drop policy if exists "messages_insert_therapist" on public.thread_messages;

-- Employees open threads for themselves, unassigned (routing assigns them, never the employee).
create policy "threads_insert_own" on public.therapist_threads for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'unassigned' and assigned_coach_id is null);

create policy "messages_insert_own_open_threads" on public.thread_messages for insert to authenticated
  with check (
    sender_role = 'user'
    and exists (select 1 from public.therapist_threads t
                where t.id = thread_messages.thread_id and t.user_id = (select auth.uid()) and t.status <> 'resolved')
  );

create policy "messages_insert_therapist" on public.thread_messages for insert to authenticated
  with check (
    sender_role = 'therapist'
    and exists (select 1 from public.therapist_threads t
                where t.id = thread_messages.thread_id and t.status <> 'resolved' and t.team = (select public.staff_team()))
  );

-- Image uploads follow the same "not resolved" rule.
create or replace function public.chat_thread_open_member(p_thread text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_thread ~ '^[0-9a-f-]{36}$' and exists (
    select 1 from public.therapist_threads t
    where t.id = p_thread::uuid
      and t.status <> 'resolved'
      and (t.user_id = (select auth.uid()) or t.team = public.staff_team())
  )
$$;

-- Staff resolve or reopen a thread. Reopening goes back to in_progress when it
-- has a coach, otherwise to the unassigned pool. (Direct status edits must
-- also satisfy the assignment rule above.)
create or replace function public.set_thread_resolved(p_thread uuid, p_resolved boolean)
returns public.thread_status
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  result public.thread_status;
begin
  update public.therapist_threads
  set status = case when p_resolved then 'resolved'::public.thread_status
                    when assigned_coach_id is not null then 'in_progress'::public.thread_status
                    else 'unassigned'::public.thread_status end
  where id = p_thread
  returning status into result;
  if result is null then
    raise exception 'That conversation wasn''t found.' using errcode = 'P0002';
  end if;
  return result;
end;
$$;
revoke all on function public.set_thread_resolved(uuid, boolean) from public, anon;
grant execute on function public.set_thread_resolved(uuid, boolean) to authenticated;

-- The staff queue, now with assignment (same rows and visibility as before).
drop function if exists public.therapist_queue(uuid);
create function public.therapist_queue(p_thread_id uuid default null)
returns table (
  thread_id          uuid,
  team               text,
  status             public.thread_status,
  assigned_coach_id  uuid,
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
    t.id, t.team, t.status, t.assigned_coach_id, t.created_at, t.user_id,
    coalesce(nullif(p.full_name, ''), 'Employee')::text,
    u.email::text,
    coalesce(s.n, 0)::integer,
    last.created_at, last.sender_role, left(last.content, 160),
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
  order by (t.status <> 'resolved') desc, (last.sender_role = 'user') desc, coalesce(last.created_at, t.created_at) asc
  limit 200;
end;
$$;
revoke all on function public.therapist_queue(uuid) from public, anon;
grant execute on function public.therapist_queue(uuid) to authenticated;

-- ============================================================
-- 4. Capacity: current_load is recalculated, max_capacity is enforced
-- ============================================================

-- Recount one coach's in-progress threads.
create or replace function public.recalc_coach_load(p_coach uuid)
returns void language sql volatile security definer set search_path = '' as $$
  update public.coach_profiles c
  set current_load = (select count(*) from public.therapist_threads t where t.assigned_coach_id = p_coach and t.status = 'in_progress')
  where c.user_id = p_coach
$$;
revoke all on function public.recalc_coach_load(uuid) from public, anon, authenticated;

-- Before a thread becomes a coach's in-progress work: lock that coach's
-- profile (so two simultaneous assignments can't both slip through) and
-- refuse it if they're already at max_capacity.
create or replace function public.threads_enforce_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cap integer;
  load integer;
begin
  if new.status = 'in_progress' and new.assigned_coach_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'in_progress' or old.assigned_coach_id is distinct from new.assigned_coach_id) then
    select max_capacity into cap from public.coach_profiles where user_id = new.assigned_coach_id for update;
    if cap is null then
      raise exception 'That person isn''t a coach.' using errcode = '23503';
    end if;
    select count(*) into load from public.therapist_threads
    where assigned_coach_id = new.assigned_coach_id and status = 'in_progress' and id <> new.id;
    if load >= cap then
      raise exception 'This coach is at full capacity (% of %).', load, cap using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- After any change: recount the coach(es) involved.
create or replace function public.threads_recalc_load()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.assigned_coach_id is not null then
    perform public.recalc_coach_load(old.assigned_coach_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.assigned_coach_id is not null
     and (tg_op = 'INSERT' or new.assigned_coach_id is distinct from old.assigned_coach_id or new.status is distinct from old.status) then
    perform public.recalc_coach_load(new.assigned_coach_id);
  end if;
  return null;
end;
$$;

drop trigger if exists threads_enforce_capacity on public.therapist_threads;
create trigger threads_enforce_capacity before insert or update of status, assigned_coach_id on public.therapist_threads
  for each row execute procedure public.threads_enforce_capacity();

drop trigger if exists threads_recalc_load on public.therapist_threads;
create trigger threads_recalc_load after insert or update of status, assigned_coach_id or delete on public.therapist_threads
  for each row execute procedure public.threads_recalc_load();

-- Bring every coach's load up to date (also fixes any drift on re-run).
select public.recalc_coach_load(user_id) from public.coach_profiles;
