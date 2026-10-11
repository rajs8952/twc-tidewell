-- ============================================================
-- OmniWell personal goals. Run AFTER profile.sql.
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
-- Each employee can set their own targets (Profile → Your goals); the
-- defaults are the guidance the app used before:
--   goal_sleep_min          7 hours a night        (4–12 h)
--   goal_meditation_min     10 minutes a day       (1–120)
--   goal_exercise_week_min  150 minutes a week     (30–1,500; the WHO guideline)
-- The water goal already lives in custom_goal_ml. Profiles' existing
-- row-level security already lets people update only their own row.
-- ============================================================

alter table public.profiles add column if not exists goal_sleep_min integer not null default 420;
alter table public.profiles add column if not exists goal_meditation_min integer not null default 10;
alter table public.profiles add column if not exists goal_exercise_week_min integer not null default 150;

alter table public.profiles drop constraint if exists profiles_goal_sleep_range;
alter table public.profiles drop constraint if exists profiles_goal_meditation_range;
alter table public.profiles drop constraint if exists profiles_goal_exercise_range;
alter table public.profiles add constraint profiles_goal_sleep_range check (goal_sleep_min between 240 and 720);
alter table public.profiles add constraint profiles_goal_meditation_range check (goal_meditation_min between 1 and 120);
alter table public.profiles add constraint profiles_goal_exercise_range check (goal_exercise_week_min between 30 and 1500);
