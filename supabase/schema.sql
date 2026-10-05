-- ============================================================
-- OmniWell (formerly Tidewell) core schema. Paste into Supabase → SQL Editor → Run.
-- Safe to re-run.
-- ============================================================

-- ---------- Profiles ----------
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text        not null default '',
  avatar_url      text,
  weight_kg       numeric(5,1) not null default 70 check (weight_kg between 25 and 300),
  gender          text        not null default 'unspecified'
                    check (gender in ('male', 'female', 'unspecified')),
  activity_level  text        not null default 'moderate'
                    check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'athlete')),
  custom_goal_ml  integer     check (custom_goal_ml is null or custom_goal_ml between 500 and 8000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute procedure public.touch_updated_at();

-- create a profile row automatically from sign-up metadata
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, weight_kg, gender, activity_level)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'weight_kg', '')::numeric, 70),
    coalesce(new.raw_user_meta_data ->> 'gender', 'unspecified'),
    coalesce(new.raw_user_meta_data ->> 'activity_level', 'moderate')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- Drink logs ----------
create table if not exists public.drink_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  beverage     text not null check (beverage in ('water', 'sparkling', 'tea', 'coffee', 'juice', 'milk')),
  amount_ml    integer not null check (amount_ml between 1 and 5000),
  multiplier   numeric(3,2) not null check (multiplier between 0 and 1.5),
  effective_ml integer generated always as (round(amount_ml * multiplier)::integer) stored,
  logged_at    timestamptz not null default now()
);

create index if not exists drink_logs_user_time_idx on public.drink_logs (user_id, logged_at desc);

alter table public.drink_logs enable row level security;

drop policy if exists "logs_select_own" on public.drink_logs;
drop policy if exists "logs_insert_own" on public.drink_logs;
drop policy if exists "logs_update_own" on public.drink_logs;
drop policy if exists "logs_delete_own" on public.drink_logs;
create policy "logs_select_own" on public.drink_logs for select using (auth.uid() = user_id);
create policy "logs_insert_own" on public.drink_logs for insert with check (auth.uid() = user_id);
create policy "logs_update_own" on public.drink_logs for update using (auth.uid() = user_id);
create policy "logs_delete_own" on public.drink_logs for delete using (auth.uid() = user_id);

-- Daily totals in the user's own timezone (used for streaks and history).
create or replace function public.daily_totals(p_tz text default 'UTC', p_days integer default 365)
returns table (day date, total_ml bigint)
language sql stable security invoker set search_path = public as $$
  select (logged_at at time zone p_tz)::date as day,
         sum(effective_ml)::bigint          as total_ml
  from public.drink_logs
  where user_id = auth.uid()
    and logged_at >= now() - make_interval(days => p_days)
  group by 1
  order by 1;
$$;

grant execute on function public.daily_totals(text, integer) to authenticated;

-- ---------- Avatar storage ----------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_insert_own"  on storage.objects;
drop policy if exists "avatars_update_own"  on storage.objects;
drop policy if exists "avatars_delete_own"  on storage.objects;

create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
