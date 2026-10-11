-- ============================================================
-- OmniWell onboarding: what each employee wants to focus on.
-- Run AFTER personal-goals.sql. Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
--   focus_trackers  the 1–3 trackers they chose on the welcome screen (/welcome);
--                   Home lists them first
--   onboarded_at    when they finished (or skipped) the welcome screen; null
--                   means new users are taken there once
--
-- Existing accounts are marked as onboarded, so nobody already using
-- OmniWell is sent through the welcome screen (they can still open it).
-- Profiles' existing row-level security lets people update only their own row.
-- ============================================================

alter table public.profiles add column if not exists focus_trackers text[] not null default '{}';
alter table public.profiles add column if not exists onboarded_at timestamptz;

alter table public.profiles drop constraint if exists profiles_focus_trackers_valid;
alter table public.profiles add constraint profiles_focus_trackers_valid check (
  cardinality(focus_trackers) <= 6
  and focus_trackers <@ array['water', 'mood', 'sleep', 'meditation', 'exercise', 'weight']::text[]
);

-- Everyone who signed up before today counts as onboarded.
update public.profiles set onboarded_at = coalesce(created_at, now())
where onboarded_at is null and created_at < now() - interval '1 day';
