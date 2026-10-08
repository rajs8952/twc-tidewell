-- ============================================================
-- OmniWell: roles (RBAC) and image sharing in chats.
-- Run AFTER therapist-messaging.sql and therapist-portal.sql.
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
--   1. user_roles        admin / coach / user. Only admins can read or change it;
--                        everyone can ask for their own role via my_role().
--   2. thread_messages   + media_url / media_type: a message can carry one image.
--   3. chat_media        private Storage bucket for those images. Only the
--                        thread's employee and their team's staff can upload or
--                        view a thread's images. Images only: no video, no PDF.
--
-- The first admin has to be added here, in the SQL Editor:
--   insert into public.user_roles (user_id, role)
--   select id, 'admin' from auth.users where email = 'you@example.com'
--   on conflict (user_id) do update set role = 'admin';
-- ============================================================

-- ============================================================
-- 1. Roles
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role' and typnamespace = 'public'::regnamespace) then
    create type public.app_role as enum ('admin', 'coach', 'user');
  end if;
end
$$;

create table if not exists public.user_roles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        public.app_role not null default 'user',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- True when the caller is an admin. SECURITY DEFINER: it reads user_roles as
-- the table owner, so the policies below can use it without recursing into
-- themselves. (For that reason user_roles is not FORCE ROW LEVEL SECURITY.)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin')
$$;

-- The caller's own role, so the app can show or hide admin features.
-- Users with no row are plain 'user'. Reveals nothing about anyone else.
create or replace function public.my_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select coalesce((select role from public.user_roles where user_id = (select auth.uid())), 'user'::public.app_role)
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.my_role() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_role() to authenticated;

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon;
grant select, insert, update, delete on public.user_roles to authenticated;

drop policy if exists "user_roles_admin_select" on public.user_roles;
drop policy if exists "user_roles_admin_insert" on public.user_roles;
drop policy if exists "user_roles_admin_update" on public.user_roles;
drop policy if exists "user_roles_admin_delete" on public.user_roles;
create policy "user_roles_admin_select" on public.user_roles for select to authenticated using ((select public.is_admin()));
create policy "user_roles_admin_insert" on public.user_roles for insert to authenticated with check ((select public.is_admin()));
create policy "user_roles_admin_update" on public.user_roles for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "user_roles_admin_delete" on public.user_roles for delete to authenticated using ((select public.is_admin()));

-- Keeps updated_at fresh, and refuses to remove or demote the last admin
-- (which would lock everyone out of the admin portal).
create or replace function public.user_roles_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  if (tg_op = 'DELETE' and old.role = 'admin') or (tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin') then
    if (select count(*) from public.user_roles where role = 'admin' and user_id <> old.user_id) = 0 then
      raise exception 'OmniWell needs at least one admin. Make someone else an admin first.' using errcode = '23514';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists user_roles_guard on public.user_roles;
create trigger user_roles_guard before update or delete on public.user_roles
  for each row execute procedure public.user_roles_guard();

-- Existing therapists and dietitians become coaches. Their team stays in
-- public.therapists, which the chat's security rules use.
insert into public.user_roles (user_id, role)
select t.user_id, 'coach' from public.therapists t
on conflict (user_id) do nothing;

-- ============================================================
-- 2. Images on chat messages
-- ============================================================
-- media_url holds the image's path in the private chat_media bucket
-- ("<thread_id>/<file>"), not a public link; the app shows it through a
-- short-lived signed URL.
alter table public.thread_messages add column if not exists media_url text;
alter table public.thread_messages add column if not exists media_type text;

alter table public.thread_messages drop constraint if exists thread_messages_content_check;
alter table public.thread_messages drop constraint if exists thread_messages_body;
alter table public.thread_messages drop constraint if exists thread_messages_media;
-- Text is 1–4,000 characters, except that an image may be sent on its own (empty caption).
alter table public.thread_messages add constraint thread_messages_body check (
  char_length(content) <= 4000
  and (char_length(btrim(content)) > 0 or media_url is not null)
);
-- Images only; the file must sit in this message's own thread folder. Both
-- columns are set together or not at all. (coalesce keeps a half-filled pair
-- from passing: in SQL a check that comes out NULL counts as passed.)
alter table public.thread_messages add constraint thread_messages_media check (
  (media_url is null and media_type is null)
  or (
    coalesce(media_type, '') = 'image'
    and coalesce(media_url, '') ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$'
    and split_part(coalesce(media_url, ''), '/', 1) = thread_id::text
  )
);

-- ============================================================
-- 3. Private bucket for chat images
-- ============================================================
-- 5 MB per file and image types only, enforced by Supabase Storage itself.
-- (The app also shrinks photos before uploading, to save bandwidth.)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat_media', 'chat_media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Who is part of a thread: its employee, or staff of the thread's team.
-- Takes the folder name as text so a malformed path is simply "no" rather than an error.
create or replace function public.chat_thread_member(p_thread text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_thread ~ '^[0-9a-f-]{36}$' and exists (
    select 1 from public.therapist_threads t
    where t.id = p_thread::uuid
      and (t.user_id = (select auth.uid()) or t.team = public.staff_team())
  )
$$;

-- Uploading also needs the thread to be open (like sending a message).
create or replace function public.chat_thread_open_member(p_thread text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_thread ~ '^[0-9a-f-]{36}$' and exists (
    select 1 from public.therapist_threads t
    where t.id = p_thread::uuid
      and t.status = 'open'
      and (t.user_id = (select auth.uid()) or t.team = public.staff_team())
  )
$$;

revoke all on function public.chat_thread_member(text) from public, anon;
revoke all on function public.chat_thread_open_member(text) from public, anon;
grant execute on function public.chat_thread_member(text) to authenticated;
grant execute on function public.chat_thread_open_member(text) to authenticated;

drop policy if exists "chat_media_select_members" on storage.objects;
drop policy if exists "chat_media_insert_members" on storage.objects;

-- View: members of the thread whose folder the image is in.
create policy "chat_media_select_members" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat_media' and public.chat_thread_member((storage.foldername(name))[1]));

-- Upload: members of an open thread, into that thread's folder only, one
-- folder deep, with an image file name.
create policy "chat_media_insert_members" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat_media'
    and array_length(storage.foldername(name), 1) = 1
    and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$'
    and public.chat_thread_open_member((storage.foldername(name))[1])
  )
;
-- No update or delete policies: shared images, like messages, are a permanent record.
