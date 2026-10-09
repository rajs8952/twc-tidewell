-- ============================================================
-- OmniWell coach profiles (name, title, photo) and the "Online" badge.
-- Run AFTER chat-receipts-and-scoping.sql. Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
--   1. Coaches edit their own display name and title from the coach portal
--      (photo uses the existing avatars bucket and profiles.avatar_url).
--   2. While a coach has the portal open, it sends a heartbeat every minute;
--      a coach seen in the last 2 minutes shows as Online.
--   3. Employees see name, title, photo and online status of the coach on
--      their own conversations, and nothing else about coaches. "Last seen"
--      times are never shown to employees, only online yes/no.
-- ============================================================

-- ---------- 1. Coach name and title ----------
alter table public.therapists add column if not exists title text not null default '';
alter table public.therapists drop constraint if exists therapists_title_length;
alter table public.therapists add constraint therapists_title_length check (char_length(title) <= 80);

-- The signed-in coach updates their own name and title (nothing else, nobody else's).
create or replace function public.update_my_coach_profile(p_display_name text, p_title text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  name_clean  text := btrim(coalesce(p_display_name, ''));
  title_clean text := btrim(coalesce(p_title, ''));
begin
  if char_length(name_clean) not between 1 and 120 then
    raise exception 'Enter your name (up to 120 characters).' using errcode = '22023';
  end if;
  if char_length(title_clean) > 80 then
    raise exception 'Keep your title under 80 characters.' using errcode = '22023';
  end if;
  update public.therapists set display_name = name_clean, title = title_clean where user_id = auth.uid();
  if not found then
    raise exception 'Only coaches have a coach profile.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.update_my_coach_profile(text, text) from public, anon;
grant execute on function public.update_my_coach_profile(text, text) to authenticated;

-- ---------- 2. Presence heartbeat ----------
alter table public.coach_profiles add column if not exists last_seen_at timestamptz;

-- Called every minute by the coach portal while it's open and visible.
create or replace function public.coach_heartbeat()
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.coach_profiles set last_seen_at = now() where user_id = auth.uid()
$$;
revoke all on function public.coach_heartbeat() from public, anon;
grant execute on function public.coach_heartbeat() to authenticated;

-- ---------- 3. What employees see about their coach ----------
-- Replaces the earlier version (which returned the name only).
drop function if exists public.my_chat_coaches();
create function public.my_chat_coaches()
returns table (thread_id uuid, coach_name text, coach_title text, coach_avatar_url text, coach_online boolean)
language sql stable security definer set search_path = ''
as $$
  select
    t.id,
    coalesce(nullif(btrim(th.display_name), ''), nullif(btrim(p.full_name), ''), 'Your coach')::text,
    coalesce(th.title, '')::text,
    p.avatar_url,
    coalesce(c.last_seen_at > now() - interval '2 minutes', false)
  from public.therapist_threads t
  left join public.therapists th on th.user_id = t.assigned_coach_id
  left join public.profiles p on p.id = t.assigned_coach_id
  left join public.coach_profiles c on c.user_id = t.assigned_coach_id
  where t.user_id = auth.uid() and t.assigned_coach_id is not null
$$;
revoke all on function public.my_chat_coaches() from public, anon;
grant execute on function public.my_chat_coaches() to authenticated;
