-- ============================================================
-- OmniWell reminders: run delivery every 15 minutes from Supabase.
-- (Vercel's Hobby plan only allows cron jobs once a day, so Supabase's
-- pg_cron calls the route instead, with the same secret Vercel Cron would send.)
--
-- Before running this: store CRON_SECRET in Supabase Vault under the name
-- 'omniwell_cron_secret' (a one-off snippet, kept out of this repo).
-- Then paste this into Supabase → SQL Editor → Run. Safe to re-run.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Re-scheduling under the same name replaces the existing job.
select cron.schedule(
  'omniwell-notify',
  '*/15 * * * *',
  $job$
    select net.http_get(
      url := 'https://omniwell-app.vercel.app/api/cron/notify',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'omniwell_cron_secret' limit 1)
      ),
      timeout_milliseconds := 30000
    );
  $job$
);

-- ---------- Checking it ----------
-- The job:            select jobname, schedule, active from cron.job;
-- Recent runs:        select status, start_time, return_message from cron.job_run_details order by start_time desc limit 5;
-- The route's answer: select status_code, content::text, created from net._http_response order by created desc limit 5;
--   (200 with {"devices":…,"sent":…} is healthy; 401 means the Vault secret doesn't match Vercel's CRON_SECRET.)
-- To stop it:         select cron.unschedule('omniwell-notify');
