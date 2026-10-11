-- ============================================================
-- OmniWell chat lists that don't silently drop conversations.
-- Run AFTER chat-receipts-and-scoping.sql. Paste into Supabase → SQL Editor → Run. Safe to re-run.
-- This is now the current definition of therapist_queue(); earlier files that
-- define it (therapist-portal.sql, sticky-queue.sql, chat-receipts-and-scoping.sql)
-- must not be re-run after this one.
--
--   1. therapist_queue(): the coach's queue used to stop at 200 rows in total,
--      so with a busy pool or a long history, new pool chats and older
--      conversations simply vanished. Now every list has its own allowance:
--        all of the coach's open conversations (bounded by their capacity),
--        the team's pool, oldest first, up to 500,
--        the coach's 100 most recently closed conversations.
--   2. my_chat_previews(): the employee's chat list now gets each
--      conversation's latest message directly, instead of the newest 300
--      messages overall (one busy chat could push the others' previews out).
-- ============================================================

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
  with picked as (
    -- One thread (when asked for), or the three lists, each with its own allowance.
    (select t.id from public.therapist_threads t
      where p_thread_id is not null and t.id = p_thread_id and t.team = my_team
        and (t.status = 'unassigned' or t.assigned_coach_id = me))
    union all
    (select t.id from public.therapist_threads t
      where p_thread_id is null and t.team = my_team and t.status = 'in_progress' and t.assigned_coach_id = me)
    union all
    (select t.id from public.therapist_threads t
      where p_thread_id is null and t.team = my_team and t.status = 'unassigned'
      order by t.created_at asc limit 500)
    union all
    (select t.id from public.therapist_threads t
      where p_thread_id is null and t.team = my_team and t.status = 'resolved' and t.assigned_coach_id = me
      order by t.created_at desc limit 100)
  )
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
  from picked
  join public.therapist_threads t on t.id = picked.id
  left join public.profiles p on p.id = t.user_id
  left join auth.users u on u.id = t.user_id
  left join lateral (select count(*) as n from public.thread_messages m where m.thread_id = t.id) s on true
  left join lateral (
    select m.created_at, m.sender_role, m.content from public.thread_messages m
    where m.thread_id = t.id order by m.created_at desc, m.id desc limit 1
  ) last on true
  order by (t.status <> 'resolved') desc, (last.sender_role = 'user') desc, coalesce(last.created_at, t.created_at) asc;
end;
$$;
revoke all on function public.therapist_queue(uuid) from public, anon;
grant execute on function public.therapist_queue(uuid) to authenticated;

-- Each of the caller's conversations with its latest message. Runs as the
-- caller (security invoker), so row-level security still decides what they see.
create or replace function public.my_chat_previews()
returns table (thread_id uuid, sender_role public.message_sender_role, content text, created_at timestamptz, media_url text)
language sql stable security invoker set search_path = ''
as $$
  select distinct on (m.thread_id) m.thread_id, m.sender_role, left(m.content, 200), m.created_at, m.media_url
  from public.thread_messages m
  join public.therapist_threads t on t.id = m.thread_id
  where t.user_id = auth.uid()
  order by m.thread_id, m.created_at desc, m.id desc
$$;
revoke all on function public.my_chat_previews() from public, anon;
grant execute on function public.my_chat_previews() to authenticated;
