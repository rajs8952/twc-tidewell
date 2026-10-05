-- ============================================================
-- OmniWell wellness trackers, phase 1: tables only.
-- Run AFTER schema.sql. Paste into Supabase → SQL Editor → Run.
-- Safe to re-run. Does not touch profiles or drink_logs.
--
-- Every table follows the drink_logs pattern:
--   user_id  → auth.users (the central user table), defaults to the caller
--   logged_at → when the entry happened (editable), created_at → when it was saved
--   row-level security so each user can only see and change their own rows
-- ============================================================

-- ---------- Mood ----------
create table if not exists public.mood_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mood_state    text not null check (mood_state in ('awful', 'bad', 'okay', 'good', 'great')),
  energy_level  smallint check (energy_level between 1 and 5),
  stress_level  smallint check (stress_level between 1 and 5),
  emotions      text[] not null default '{}' check (cardinality(emotions) <= 12),
  note          text check (char_length(note) <= 1000),
  logged_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- ---------- Meditation ----------
create table if not exists public.meditation_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  duration_min  integer not null check (duration_min between 1 and 600),
  session_type  text not null default 'mindfulness'
                  check (session_type in ('mindfulness', 'breathing', 'body_scan', 'loving_kindness', 'guided', 'other')),
  calm_before   smallint check (calm_before between 1 and 5),
  calm_after    smallint check (calm_after between 1 and 5),
  note          text check (char_length(note) <= 1000),
  logged_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- ---------- Weight ----------
-- profiles.weight_kg stays the value the water goal uses; these are history entries.
create table if not exists public.weight_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  weight_kg     numeric(5,1) not null check (weight_kg between 25 and 300),
  body_fat_pct  numeric(4,1) check (body_fat_pct between 2 and 75),
  note          text check (char_length(note) <= 1000),
  logged_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- ---------- Sleep ----------
-- One row per sleep. Duration is computed from bed and wake times so it can't drift.
create table if not exists public.sleep_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bed_at        timestamptz not null,
  wake_at       timestamptz not null,
  duration_min  integer generated always as ((extract(epoch from (wake_at - bed_at)) / 60)::integer) stored,
  quality       smallint not null check (quality between 1 and 5),
  awakenings    smallint check (awakenings between 0 and 50),
  note          text check (char_length(note) <= 1000),
  logged_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint sleep_wake_after_bed check (wake_at > bed_at and wake_at - bed_at <= interval '24 hours')
);

-- ---------- Exercise ----------
create table if not exists public.exercise_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  activity      text not null
                  check (activity in ('walking', 'running', 'cycling', 'swimming', 'strength', 'yoga', 'hiit', 'sports', 'other')),
  duration_min  integer not null check (duration_min between 1 and 1440),
  intensity     text not null default 'moderate' check (intensity in ('light', 'moderate', 'vigorous')),
  calories_kcal integer check (calories_kcal between 0 and 10000),
  distance_km   numeric(6,2) check (distance_km between 0 and 1000),
  note          text check (char_length(note) <= 1000),
  logged_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- ---------- Indexes ----------
create index if not exists mood_logs_user_time_idx       on public.mood_logs (user_id, logged_at desc);
create index if not exists meditation_logs_user_time_idx on public.meditation_logs (user_id, logged_at desc);
create index if not exists weight_logs_user_time_idx     on public.weight_logs (user_id, logged_at desc);
create index if not exists sleep_logs_user_wake_idx      on public.sleep_logs (user_id, wake_at desc);
create index if not exists exercise_logs_user_time_idx   on public.exercise_logs (user_id, logged_at desc);

-- ---------- Row-level security: own rows only ----------
do $$
declare
  t text;
begin
  foreach t in array array['mood_logs', 'meditation_logs', 'weight_logs', 'sleep_logs', 'exercise_logs'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format('create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id)', t || '_delete_own', t);
  end loop;
end
$$;
