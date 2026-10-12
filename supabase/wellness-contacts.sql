-- ============================================================
-- OmniWell wellness contacts, editable in the admin portal
-- (/admin/contacts) instead of in the code.
-- Run AFTER rbac-and-chat-media.sql (it uses is_admin()).
-- Paste into Supabase → SQL Editor → Run. Safe to re-run: existing
-- details are kept; only missing rows are added.
--
--   eap, therapist, dietitian  name, description, phone, email, link, hours
--   emergency                  phone only: the local emergency number (112)
--
-- Every signed-in person can read them (the crisis prompt, chat headers and
-- "Your wellness team" show them). Only admins can change them.
-- ============================================================

create table if not exists public.wellness_contacts (
  id          text primary key check (id in ('eap', 'therapist', 'dietitian', 'emergency')),
  name        text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 200),
  phone       text check (phone ~ '^\+?[0-9][0-9 ()-]{1,24}$'),
  email       text check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  url         text check (char_length(url) <= 300 and url ~ '^https://'),
  hours       text check (char_length(hours) <= 120),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

-- Today's details (from the app), so nothing changes until an admin edits them.
insert into public.wellness_contacts (id, name, description, phone, email) values
  ('eap',       'Employee Assistance Programme', 'Support with work, family, money or legal worries.',           '+91 98751 08108', 'eap@thewellnesscorner.com'),
  ('therapist', 'Therapist',                     'One-to-one sessions for stress, anxiety, low mood or burnout.', '+91 98751 08108', 'eap@thewellnesscorner.com'),
  ('dietitian', 'Dietitian',                     'Personal advice on eating, energy and healthy weight.',         null,              'dietitian@thewellnesscorner.com'),
  ('emergency', 'Emergency services',            '',                                                              '112',             null)
on conflict (id) do nothing;

alter table public.wellness_contacts enable row level security;

drop policy if exists "wellness_contacts: signed-in read" on public.wellness_contacts;
create policy "wellness_contacts: signed-in read" on public.wellness_contacts
  for select to authenticated using (true);

drop policy if exists "wellness_contacts: admins update" on public.wellness_contacts;
create policy "wellness_contacts: admins update" on public.wellness_contacts
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));

revoke all on public.wellness_contacts from anon;
-- Rows are fixed (one per contact): admins can change them, but not add or remove them.
grant select, update on public.wellness_contacts to authenticated;
