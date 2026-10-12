-- ============================================================
-- OmniWell coach operations view (admin portal → Coaches): workload and
-- response times per coach, for admins. Run AFTER sticky-queue.sql,
-- coach-profile-presence.sql and therapist-portal.sql.
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
--   therapist_threads.resolved_at  when a conversation was closed (set
--     automatically from now on; earlier closed ones get their last
--     message's time, the best estimate available)
--   admin_coach_stats(p_days)      one row per coach, plus a pool row per
--     team. Counts and times only: no employee names, no message content.
-- ============================================================

alter table public.therapist_threads add column if not exists resolved_at timestamptz;

-- Earlier closed conversations: their last message is the closest we have.
update public.therapist_threads t
set resolved_at = coalesce((select max(m.created_at) from public.thread_messages m where m.thread_id = t.id), t.created_at)
where t.status::text in ('resolved', 'closed') and t.resolved_at is null;

create or replace function public.stamp_thread_resolved()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status::text in ('resolved', 'closed') and (tg_op = 'INSERT' or old.status::text not in ('resolved', 'closed')) then
    new.resolved_at := now();
  elsif new.status::text not in ('resolved', 'closed') then
    new.resolved_at := null;   -- reopened
  end if;
  return new;
end;
$$;

drop trigger if exists therapist_threads_stamp_resolved on public.therapist_threads;
create trigger therapist_threads_stamp_resolved
  before insert or update of status on public.therapist_threads
  for each row execute function public.stamp_thread_resolved();

create or replace function public.admin_coach_stats(p_days integer default 30)
returns table (
  coach_id            uuid,       -- null on the team's pool row
  team                text,
  display_name        text,
  title               text,
  is_accepting_new    boolean,
  max_capacity        integer,
  current_load        integer,
  last_seen_at        timestamptz,
  open_now            integer,    -- conversations they have now (pool row: unclaimed)
  waiting_now         integer,    -- of those, waiting for a reply
  overdue_now         integer,    -- waiting more than 24 hours
  oldest_wait_hours   numeric,
  replies_sent        integer,    -- messages they sent in the period
  answered            integer,    -- employee messages they answered in the period
  median_reply_hours  numeric,    -- typical time to answer an employee
  within_24h          numeric,    -- share answered within 24 hours (late or still unanswered count against it)
  closed              integer     -- conversations they closed in the period
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := now() - make_interval(days => days);
begin
  if not public.is_admin() then
    raise exception 'Only admins can see coach operations.' using errcode = '42501';
  end if;

  return query
  with
  coaches as (
    select cp.user_id, cp.category::text as team, cp.is_accepting_new, cp.max_capacity, cp.current_load, cp.last_seen_at,
           coalesce(nullif(th.display_name, ''), nullif(p.full_name, ''), 'Coach') as display_name,
           coalesce(th.title, '') as title
    from public.coach_profiles cp
    join public.user_roles r on r.user_id = cp.user_id and r.role::text = 'coach'
    left join public.therapists th on th.user_id = cp.user_id
    left join public.profiles p on p.id = cp.user_id
  ),
  -- Each open conversation's newest message, to tell who is waiting on whom.
  open_threads as (
    select t.id, t.team, t.status::text as status, t.assigned_coach_id, last.role as last_role, last.at as last_at
    from public.therapist_threads t
    join lateral (select m.sender_role::text as role, m.created_at as at from public.thread_messages m where m.thread_id = t.id order by m.created_at desc limit 1) last on true
    where t.status::text not in ('resolved', 'closed')
  ),
  -- When the employee's current unanswered run of messages began.
  waits as (
    select o.*, (
      select min(m.created_at) from public.thread_messages m
      where m.thread_id = o.id and m.sender_role::text = 'user'
        and m.created_at > coalesce((select max(x.created_at) from public.thread_messages x where x.thread_id = o.id and x.sender_role::text = 'therapist'), '-infinity')
    ) as waiting_since
    from open_threads o
    where o.last_role = 'user'
  ),
  -- Every time an employee wrote after a reply (or first), and when someone next answered.
  runs as (
    select m.thread_id, t.assigned_coach_id, m.created_at as asked_at,
           (select r.created_at from public.thread_messages r where r.thread_id = m.thread_id and r.sender_role::text = 'therapist' and r.created_at > m.created_at order by r.created_at limit 1) as answered_at,
           (select r.sender_id from public.thread_messages r where r.thread_id = m.thread_id and r.sender_role::text = 'therapist' and r.created_at > m.created_at order by r.created_at limit 1) as answered_by
    from public.thread_messages m
    join public.therapist_threads t on t.id = m.thread_id
    where m.sender_role::text = 'user' and m.created_at >= since
      and coalesce((select p.sender_role::text from public.thread_messages p where p.thread_id = m.thread_id and p.created_at < m.created_at order by p.created_at desc limit 1), 'therapist') <> 'user'
  ),
  -- Answered runs belong to whoever answered; unanswered ones to the coach who has the conversation.
  owned as (
    select coalesce(answered_by, assigned_coach_id) as coach, asked_at, answered_at from runs
  ),
  reply_stats as (
    select coach,
           count(answered_at) as answered,
           percentile_cont(0.5) within group (order by extract(epoch from answered_at - asked_at) / 3600.0) filter (where answered_at is not null) as median_h,
           avg(case when answered_at is not null then (case when answered_at - asked_at <= interval '24 hours' then 1.0 else 0.0 end)
                    when now() - asked_at > interval '24 hours' then 0.0 end) as within
    from owned where coach is not null
    group by coach
  )
  select c.user_id, c.team, c.display_name, c.title, c.is_accepting_new, c.max_capacity, c.current_load, c.last_seen_at,
         (select count(*)::int from open_threads o where o.assigned_coach_id = c.user_id),
         (select count(*)::int from waits w where w.assigned_coach_id = c.user_id),
         (select count(*)::int from waits w where w.assigned_coach_id = c.user_id and w.waiting_since < now() - interval '24 hours'),
         (select round((extract(epoch from now() - min(w.waiting_since)) / 3600.0)::numeric, 1) from waits w where w.assigned_coach_id = c.user_id),
         (select count(*)::int from public.thread_messages m where m.sender_id = c.user_id and m.sender_role::text = 'therapist' and m.created_at >= since),
         coalesce(rs.answered, 0)::int,
         round(rs.median_h::numeric, 1),
         round(rs.within::numeric, 3),
         (select count(*)::int from public.therapist_threads t where t.assigned_coach_id = c.user_id and t.resolved_at >= since)
  from coaches c
  left join reply_stats rs on rs.coach = c.user_id
  union all
  -- The pool: conversations no coach has claimed yet, per team.
  select null, tm.team, 'Pool (unclaimed)', '', null, null, null, null,
         (select count(*)::int from open_threads o where o.team = tm.team and o.assigned_coach_id is null),
         (select count(*)::int from waits w where w.team = tm.team and w.assigned_coach_id is null),
         (select count(*)::int from waits w where w.team = tm.team and w.assigned_coach_id is null and w.waiting_since < now() - interval '24 hours'),
         (select round((extract(epoch from now() - min(w.waiting_since)) / 3600.0)::numeric, 1) from waits w where w.team = tm.team and w.assigned_coach_id is null),
         null, null, null, null, null
  from (values ('therapist'), ('dietitian')) tm(team);
end;
$$;

revoke all on function public.admin_coach_stats(integer) from public, anon;
grant execute on function public.admin_coach_stats(integer) to authenticated;
