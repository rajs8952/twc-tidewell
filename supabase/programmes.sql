-- ============================================================
-- OmniWell programmes: progress through the short programmes
-- (Sleep reset, Stress reset, …). The content itself lives in the app
-- (apps/web/lib/content/programmes.ts); this only stores who started
-- which programme, when, and which days they've marked done.
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
-- ============================================================

create table if not exists public.programme_progress (
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  programme_id    text not null check (programme_id ~ '^[a-z0-9-]{1,40}$'),
  started_at      timestamptz not null default now(),
  completed_days  smallint[] not null default '{}'
                    check (cardinality(completed_days) <= 30 and 1 <= all (completed_days) and 30 >= all (completed_days)),
  finished_at     timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (user_id, programme_id)
);

alter table public.programme_progress enable row level security;

-- Each person sees and changes only their own progress. Coaches and admins don't see it.
drop policy if exists "programme_progress: own rows" on public.programme_progress;
create policy "programme_progress: own rows" on public.programme_progress
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.programme_progress from anon;
grant select, insert, update, delete on public.programme_progress to authenticated;
