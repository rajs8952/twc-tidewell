-- ============================================================
-- OmniWell plans: Free and Premium (₹99 a month or ₹599 a year, taxes
-- included). Run AFTER rbac-and-chat-media.sql, sticky-queue.sql,
-- programmes.sql and wellness-contacts.sql.
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
-- Who has Premium:
--   * coaches, admins and HR, always;
--   * everyone who signed up before this file was run (grandfathered, no end);
--   * people an admin adds or imports (their company pays, no end);
--   * new self sign-ups for 7 days (trial), then if they pay (step 2, Razorpay).
--
-- Premium is enforced here, not only in the screens:
--   * free accounts can't start a chat or send a message to coaches;
--   * free accounts can only start the free programme (Hydration kickstart);
--   * free accounts can only read the emergency number (112) from the
--     wellness contacts; the EAP, therapist and dietitian details are Premium.
-- ============================================================

create table if not exists public.subscriptions (
  user_id                   uuid primary key references auth.users (id) on delete cascade,
  plan                      text not null default 'free' check (plan in ('free', 'premium')),
  -- How they got it: trial, paid, company (added/imported by an admin), grandfathered, admin (granted by hand).
  source                    text not null default 'none' check (source in ('none', 'trial', 'paid', 'company', 'grandfathered', 'admin')),
  -- When Premium ends; null means no end date (company, grandfathered, admin grants).
  premium_until             timestamptz,
  billing_period            text check (billing_period in ('monthly', 'yearly')),
  status                    text not null default 'active' check (status in ('active', 'past_due', 'cancelled', 'halted')),
  cancel_at_period_end      boolean not null default false,
  trial_used                boolean not null default false,
  -- Payment provider references (Razorpay, step 2).
  provider                  text check (provider in ('razorpay')),
  provider_customer_id      text,
  provider_subscription_id  text unique,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- People can read their own plan; nobody changes it from the app (the server does, with the service role).
drop policy if exists "subscriptions: read own" on public.subscriptions;
create policy "subscriptions: read own" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.subscriptions from anon;
revoke insert, update, delete on public.subscriptions from authenticated;
grant select on public.subscriptions to authenticated;

-- Everyone already here keeps everything, free of charge.
insert into public.subscriptions (user_id, plan, source, premium_until, trial_used)
select u.id, 'premium', 'grandfathered', null, true
from auth.users u
on conflict (user_id) do nothing;

-- New sign-ups start a 7-day Premium trial. (Admin-added and imported people
-- are switched to company Premium straight after, by the admin portal.)
create or replace function public.start_trial_for_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.subscriptions (user_id, plan, source, premium_until, trial_used)
  values (new.id, 'premium', 'trial', now() + interval '7 days', true)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute function public.start_trial_for_new_user();

-- Whether someone has Premium right now. Staff always do.
create or replace function public.has_premium(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.user_roles r where r.user_id = p_user and r.role::text in ('coach', 'admin', 'hr'))
      or exists (
        select 1 from public.subscriptions s
        where s.user_id = p_user and s.plan = 'premium'
          and (s.premium_until is null or s.premium_until > now())
          and s.status in ('active', 'past_due', 'cancelled')  -- cancelled keeps Premium until the paid period ends
      )
$$;

-- The caller's own Premium status, for policies (it can't be used to look up anyone else).
create or replace function public.i_have_premium()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.has_premium((select auth.uid())) $$;

-- What the app shows: plan, how they got it, when it ends.
create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'premium', public.has_premium((select auth.uid())),
    'staff', exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role::text in ('coach', 'admin', 'hr')),
    'plan', coalesce(s.plan, 'free'),
    'source', coalesce(s.source, 'none'),
    'premium_until', s.premium_until,
    'billing_period', s.billing_period,
    'status', coalesce(s.status, 'active'),
    'cancel_at_period_end', coalesce(s.cancel_at_period_end, false),
    'trial_used', coalesce(s.trial_used, false)
  )
  from (select 1) one
  left join public.subscriptions s on s.user_id = (select auth.uid())
$$;

revoke all on function public.has_premium(uuid) from public, anon, authenticated;
grant execute on function public.has_premium(uuid) to service_role;
revoke all on function public.i_have_premium() from public, anon;
grant execute on function public.i_have_premium() to authenticated;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- ---------- Chat with coaches is Premium ----------
-- Triggers rather than policies, so they also cover the routing functions
-- (submit_user_query) that write as their owner.
create or replace function public.require_premium_for_chat()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  owner uuid;
begin
  if tg_table_name = 'therapist_threads' then
    owner := new.user_id;
  elsif new.sender_role::text = 'user' then
    select t.user_id into owner from public.therapist_threads t where t.id = new.thread_id;
  else
    return new;   -- coaches' replies are never blocked
  end if;
  if owner is not null and not public.has_premium(owner) then
    raise exception 'Chat with the wellness team is part of OmniWell Premium.' using errcode = '42501', hint = 'premium_required';
  end if;
  return new;
end;
$$;

drop trigger if exists therapist_threads_require_premium on public.therapist_threads;
create trigger therapist_threads_require_premium
  before insert on public.therapist_threads
  for each row execute function public.require_premium_for_chat();

drop trigger if exists thread_messages_require_premium on public.thread_messages;
create trigger thread_messages_require_premium
  before insert on public.thread_messages
  for each row execute function public.require_premium_for_chat();

-- ---------- Programmes: one free, the rest Premium ----------
create or replace function public.require_premium_for_programme()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.programme_id <> 'hydration-kickstart' and not public.has_premium(new.user_id) then
    raise exception 'This programme is part of OmniWell Premium.' using errcode = '42501', hint = 'premium_required';
  end if;
  return new;
end;
$$;

drop trigger if exists programme_progress_require_premium on public.programme_progress;
create trigger programme_progress_require_premium
  before insert on public.programme_progress
  for each row execute function public.require_premium_for_programme();

-- ---------- Wellness contacts: free accounts see only the emergency number ----------
drop policy if exists "wellness_contacts: signed-in read" on public.wellness_contacts;
drop policy if exists "wellness_contacts: read by plan" on public.wellness_contacts;
create policy "wellness_contacts: read by plan" on public.wellness_contacts
  for select to authenticated using (id = 'emergency' or (select public.i_have_premium()));
