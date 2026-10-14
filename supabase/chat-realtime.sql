-- OmniWell chat: live updates with Supabase Realtime.
--
-- Chats, the coach queue, the Chats badge and the coach bell refresh when
-- something changes instead of polling every few seconds:
--   thread_messages        new messages
--   therapist_threads      new conversations, status changes (claimed, closed), read receipts
--   in_app_notifications   new alerts for coaches
-- (apps/web/lib/useRealtime.ts, apps/web/lib/useLivePolling.ts). The app falls
-- back to polling for any table not listed here.
--
-- Privacy: Realtime only sends a change to someone whose row-level security
-- policies let them select that row (the same policies as the app's queries:
-- employees their own threads, staff their team's, alerts only to their
-- owner). The app treats an event only as a nudge and re-reads through its
-- normal queries.
--
-- Safe to run more than once.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['thread_messages', 'therapist_threads', 'in_app_notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Check: all three tables should be listed.
select schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename in ('thread_messages', 'therapist_threads', 'in_app_notifications');
