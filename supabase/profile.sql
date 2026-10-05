-- OmniWell: biometrics on the profile (height and age), for BMI and smart targets.
-- Run once in the Supabase SQL Editor, after schema.sql. Safe to re-run.
--
-- Age is stored as a birth year rather than an age, so it never goes stale.
-- Both columns are optional: existing users simply haven't filled them in yet.

alter table public.profiles add column if not exists height_cm numeric(4,1);
alter table public.profiles add column if not exists birth_year smallint;

alter table public.profiles drop constraint if exists profiles_height_range;
alter table public.profiles add constraint profiles_height_range
  check (height_cm is null or height_cm between 100 and 250);

alter table public.profiles drop constraint if exists profiles_birth_year_range;
alter table public.profiles add constraint profiles_birth_year_range
  check (birth_year is null or birth_year between 1900 and 2100);
