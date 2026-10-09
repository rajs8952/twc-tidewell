-- ============================================================
-- OmniWell chat upgrade: per-coach visibility, delivered/read receipts,
-- coach names for employees, and "release to pool" for admins.
-- Run AFTER sticky-routing.sql and coach-alerts.sql.
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
--   1. Visibility   A coach sees only conversations assigned to them, plus
--                   their team's unassigned pool (to read and claim).
--                   Colleagues' conversations, open or closed, are hidden.
--                   Only the assigned coach can reply, upload or close.
--   2. Receipts     Each conversation records when each side last had the
--                   other's messages delivered (app loaded them) and read
--                   (conversation open on screen). Ticks are worked out
--                   from these.
--   3. Coach names  Employees can see the display name of the coach on
--                   their own conversations, and nothing else about coaches.
--   4. Release      Admins can put a coach's open conversations back in the
--                   pool (e.g. when they leave) and pause their routing.
-- ============================================================

-- ============================================================
-- 1. Per-coach visibility
-- ============================================================

-- Staff can see a thread: it's their team's, and either still in the pool
-- or assigned to them.
create or replace function public.staff_can_see(p_team text, p_status public.thread_status, p_coach uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_team = public.staff_team() and (p_status = 'unassigned' or p_coach = auth.uid())
$$;
revoke all on function public.staff_can_see(text, public.thread_status, uuid) from public, anon;
grant execute on function public.staff_can_see(text, public.thread_status, uuid) to authenticated;

drop policy if exists "threads_select_therapist" on public.therapist_threads;
drop policy if exists "threads_update_therapist" on public.therapist_threads;
drop policy if exists "messages_select_therapist" on public.thread_messages;
drop policy if exists "messages_insert_therapist" on public.thread_messages;

create policy "threads_select_therapist" on public.therapist_threads for select to authenticated
  using ((select public.staff_can_see(team, status, assigned_coach_id)));

-- Only the assigned coach changes a thread (close / reopen); claiming goes through claim_ticket().
create policy "threads_update_therapist" on public.therapist_threads for update to authenticated
  using (team = (select public.staff_team()) and assigned_coach_id = (select auth.uid()))
  with check (team = (select public.staff_team()) and assigned_coach_id = (select auth.uid()));

create policy "messages_select_therapist" on public.thread_messages for select to authenticated
  using (exists (
    select 1 from public.therapist_threads t
    where t.id = thread_messages.thread_id and public.staff_can_see(t.team, t.status, t.assigned_coach_id)
  ));

-- Replies: only the assigned coach, while it's in progress (claim a pool query first).
create policy "messages_insert_therapist" on public.thread_messages for insert to authenticated
  with check (
    sender_role = 'therapist'
    and exists (
      select 1 from public.therapist_threads t
      where t.id = thread_messages.thread_id
        and t.status = 'in_progress'
        and t.assigned_coach_id = (select auth.uid())
        and t.team = (select public.staff_team())
    )
  );

-- Chat images follow the same rules: viewing like reading, uploading like replying.
create or replace function public.chat_thread_member(p_thread text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_thread ~ '^[0-9a-f-]{36}$' and exists (
    select 1 from public.therapist_threads t
    where t.id = p_thread::uuid
      and (t.user_id = (select auth.uid()) or public.staff_can_see(t.team, t.status, t.assigned_coach_id))
  )
$$;

create or replace function public.chat_thread_open_member(p_thread text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_thread ~ '^[0-9a-f-]{36}$' and exists (
    select 1 from public.therapist_threads t
    where t.id = p_thread::uuid
      and t.status <> 'resolved'
      and (t.user_id = (select auth.uid())
           or (t.status = 'in_progress' and t.assigned_coach_id = (select auth.uid()) and t.team = public.staff_team()))
  )
$$;

-- The staff queue: same columns as before, now only the coach's own threads and the pool.
create or replace function public.therapist_queue(p_thread_id uuid default null)
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
  me      uuid := auth.uid();
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
  where t.team = my_team
    and (t.status = 'unassigned' or t.assigned_coach_id = me)
    and (p_thread_id is null or t.id = p_thread_id)
  order by (t.status <> 'resolved') desc, (last.sender_role = 'user') desc, coalesce(last.created_at, t.created_at) asc
  limit 200;
end;
$$;
revoke all on function public.therapist_queue(uuid) from public, anon;
grant execute on function public.therapist_queue(uuid) to authenticated;

-- ============================================================
-- 2. Delivered / read receipts
-- ============================================================
alter table public.therapist_threads add column if not exists user_delivered_at  timestamptz;
alter table public.therapist_threads add column if not exists user_read_at       timestamptz;
alter table public.therapist_threads add column if not exists coach_delivered_at timestamptz;
alter table public.therapist_threads add column if not exists coach_read_at      timestamptz;

-- Delivered: called whenever the app loads the caller's chat list or queue.
-- Marks every conversation of theirs that has messages from the other side
-- they hadn't received yet. Employees: their own open threads. Coaches:
-- threads assigned to them. Only writes rows that actually change.
create or replace function public.mark_threads_delivered()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  n1 integer;
  n2 integer;
begin
  if me is null then return 0; end if;

  update public.therapist_threads t set user_delivered_at = now()
  where t.user_id = me and t.status <> 'resolved'
    and exists (select 1 from public.thread_messages m
                where m.thread_id = t.id and m.sender_role = 'therapist'
                  and m.created_at > coalesce(t.user_delivered_at, '-infinity'));
  get diagnostics n1 = row_count;

  update public.therapist_threads t set coach_delivered_at = now()
  where t.assigned_coach_id = me and t.status = 'in_progress' and t.team = public.staff_team()
    and exists (select 1 from public.thread_messages m
                where m.thread_id = t.id and m.sender_role = 'user'
                  and m.created_at > coalesce(t.coach_delivered_at, '-infinity'));
  get diagnostics n2 = row_count;
  return n1 + n2;
end;
$$;

-- Read: called while a conversation is open and visible on screen. Marks it
-- delivered and read for the caller's side, if there's anything new.
-- A pool coach just browsing doesn't count as "read"; only the employee
-- and the assigned coach do.
create or replace function public.mark_thread_read(p_thread uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then return; end if;

  update public.therapist_threads t set user_read_at = now(), user_delivered_at = now()
  where t.id = p_thread and t.user_id = me
    and exists (select 1 from public.thread_messages m
                where m.thread_id = t.id and m.sender_role = 'therapist'
                  and m.created_at > coalesce(t.user_read_at, '-infinity'));

  update public.therapist_threads t set coach_read_at = now(), coach_delivered_at = now()
  where t.id = p_thread and t.assigned_coach_id = me and t.team = public.staff_team()
    and exists (select 1 from public.thread_messages m
                where m.thread_id = t.id and m.sender_role = 'user'
                  and m.created_at > coalesce(t.coach_read_at, '-infinity'));
end;
$$;

revoke all on function public.mark_threads_delivered() from public, anon;
revoke all on function public.mark_thread_read(uuid) from public, anon;
grant execute on function public.mark_threads_delivered() to authenticated;
grant execute on function public.mark_thread_read(uuid) to authenticated;
-- The receipt columns are only written by these functions (users have no
-- direct update on therapist_threads; staff may only update status).

-- ============================================================
-- 3. Coach names for employees
-- ============================================================
-- The display name of the coach on each of the caller's conversations
-- (set by the admin portal), and nothing else about them.
create or replace function public.my_chat_coaches()
returns table (thread_id uuid, coach_name text)
language sql stable security definer set search_path = ''
as $$
  select t.id, coalesce(nullif(btrim(th.display_name), ''), nullif(btrim(p.full_name), ''), 'Your coach')::text
  from public.therapist_threads t
  left join public.therapists th on th.user_id = t.assigned_coach_id
  left join public.profiles p on p.id = t.assigned_coach_id
  where t.user_id = auth.uid() and t.assigned_coach_id is not null
$$;
revoke all on function public.my_chat_coaches() from public, anon;
grant execute on function public.my_chat_coaches() to authenticated;

-- ============================================================
-- 4. Admin: release a coach's conversations to the pool
-- ============================================================
-- Puts every in-progress conversation of a coach back in their team's
-- pool and stops new chats being routed to them. For when a coach leaves,
-- is deactivated or is away. Admins only (or the server's service role).
create or replace function public.admin_release_coach_threads(p_coach uuid)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  n integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only admins can release a coach''s conversations.' using errcode = '42501';
  end if;

  update public.therapist_threads
  set status = 'unassigned', assigned_coach_id = null, coach_delivered_at = null, coach_read_at = null
  where assigned_coach_id = p_coach and status = 'in_progress';
  get diagnostics n = row_count;

  update public.coach_profiles set is_accepting_new = false where user_id = p_coach;
  return n;
end;
$$;
revoke all on function public.admin_release_coach_threads(uuid) from public, anon;
grant execute on function public.admin_release_coach_threads(uuid) to authenticated, service_role;
