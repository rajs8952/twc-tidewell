-- ============================================================
-- OmniWell "Sticky Queue", phase 2: routing and claiming.
-- Run AFTER sticky-queue.sql. Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
-- Called by the server actions in apps/web/app/actions/routing.ts:
--   submit_user_query(category, message)  employee opens a query; it goes straight to
--                                         their preferred coach if that coach has room
--                                         and is accepting new, else to the pool
--   unassigned_queue(category)            a coach's view of the pool, oldest first
--   claim_ticket(thread)                  a coach takes a query from the pool (only while
--                                         accepting new and below capacity)
--
-- They run as SECURITY DEFINER because routing must read coaches' capacity and
-- assign coaches, which users can't do directly; each one checks the caller
-- itself. claim_ticket is race-safe: row locks make simultaneous claims queue
-- up, and only the first can take an unassigned thread.
-- ============================================================

-- ---------- Employee: open a query, with sticky routing ----------
create or replace function public.submit_user_query(p_category public.coach_category, p_message text)
returns table (thread_id uuid, status public.thread_status, assigned boolean)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me        uuid := auth.uid();
  body      text := btrim(coalesce(p_message, ''));
  preferred uuid;
  coach     public.coach_profiles%rowtype;
  new_id    uuid;
  route_to  uuid;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if char_length(body) not between 1 and 4000 then
    raise exception 'Write a message of 1 to 4,000 characters.' using errcode = '22023';
  end if;

  select case p_category when 'therapist' then p.preferred_therapist_id else p.preferred_dietitian_id end
  into preferred
  from public.profiles p where p.id = me;

  -- Sticky: the preferred coach, if they still coach this category, are accepting
  -- new queries and have room. Their row is locked so capacity can't be raced.
  if preferred is not null and preferred <> me then
    select * into coach from public.coach_profiles c
    where c.user_id = preferred and c.category = p_category
    for update;
    if found and coach.is_accepting_new and coach.current_load < coach.max_capacity then
      route_to := preferred;
    end if;
  end if;

  insert into public.therapist_threads (user_id, team, status, assigned_coach_id)
  values (me, p_category::text,
          case when route_to is null then 'unassigned'::public.thread_status else 'in_progress'::public.thread_status end,
          route_to)
  returning id into new_id;

  insert into public.thread_messages (thread_id, sender_role, content)
  values (new_id, 'user', body);

  return query select new_id,
    case when route_to is null then 'unassigned'::public.thread_status else 'in_progress'::public.thread_status end,
    route_to is not null;
end;
$$;

-- ---------- Coach: the pool ----------
create or replace function public.unassigned_queue(p_category public.coach_category)
returns table (
  thread_id     uuid,
  created_at    timestamptz,
  user_name     text,
  first_message text,
  message_count integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  my_category public.coach_category;
begin
  select c.category into my_category from public.coach_profiles c where c.user_id = auth.uid();
  if my_category is null or my_category <> p_category then
    raise exception 'Only % coaches can view this queue.', p_category using errcode = '42501';
  end if;

  return query
  select t.id, t.created_at,
         coalesce(nullif(p.full_name, ''), 'Employee')::text,
         left(first.content, 200),
         coalesce(s.n, 0)::integer
  from public.therapist_threads t
  left join public.profiles p on p.id = t.user_id
  left join lateral (select count(*) as n from public.thread_messages m where m.thread_id = t.id) s on true
  left join lateral (
    select m.content from public.thread_messages m where m.thread_id = t.id order by m.created_at, m.id limit 1
  ) first on true
  where t.status = 'unassigned' and t.category_needed = p_category
  order by t.created_at asc
  limit 200;
end;
$$;

-- ---------- Coach: claim a query from the pool ----------
create or replace function public.claim_ticket(p_thread uuid)
returns table (thread_id uuid, user_id uuid, category public.coach_category)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me       uuid := auth.uid();
  coach    public.coach_profiles%rowtype;
  claimed  public.therapist_threads%rowtype;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  -- Lock the coach's own row: their simultaneous claims queue up here, so each
  -- one sees the load left by the previous one.
  select * into coach from public.coach_profiles c where c.user_id = me for update;
  if not found then
    raise exception 'Only coaches can claim queries.' using errcode = '42501';
  end if;
  -- "Accepting new" switched off: no new conversations at all, routed or claimed.
  if not coach.is_accepting_new then
    raise exception 'You''re not accepting new conversations. Switch "Accepting new" on to claim from the pool.' using errcode = '42501';
  end if;
  if coach.current_load >= coach.max_capacity then
    raise exception 'You''re at full capacity (% of %). Resolve a conversation first.', coach.current_load, coach.max_capacity using errcode = '23514';
  end if;

  -- Only an unassigned thread in their category. Two coaches racing for the same
  -- thread: the row lock makes the second wait, then its WHERE no longer matches.
  update public.therapist_threads t
  set status = 'in_progress', assigned_coach_id = me
  where t.id = p_thread and t.status = 'unassigned' and t.category_needed = coach.category
  returning * into claimed;
  if not found then
    raise exception 'This query was already claimed or is no longer available.' using errcode = 'P0002';
  end if;

  -- Sticky from now on: the employee's next query in this category comes to this coach.
  perform set_config('omniwell.routing', 'on', true);
  update public.profiles p
  set preferred_therapist_id = case when coach.category = 'therapist' then me else p.preferred_therapist_id end,
      preferred_dietitian_id = case when coach.category = 'dietitian' then me else p.preferred_dietitian_id end
  where p.id = claimed.user_id;
  perform set_config('omniwell.routing', 'off', true);

  return query select claimed.id, claimed.user_id, coach.category;
end;
$$;

revoke all on function public.submit_user_query(public.coach_category, text) from public, anon;
revoke all on function public.unassigned_queue(public.coach_category) from public, anon;
revoke all on function public.claim_ticket(uuid) from public, anon;
grant execute on function public.submit_user_query(public.coach_category, text) to authenticated;
grant execute on function public.unassigned_queue(public.coach_category) to authenticated;
grant execute on function public.claim_ticket(uuid) to authenticated;
