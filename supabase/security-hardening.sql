-- ============================================================
-- OmniWell security hardening: profile photos can no longer be listed.
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
-- The avatars bucket is public, so photos are served by their public URL
-- (profiles.avatar_url) without any storage rule. The old "avatars_public_read"
-- rule also let anyone, signed in or not, LIST the bucket, and so collect
-- every user's ID (the folder names). Now each person can only see their own
-- folder, which is all the app needs (uploading with upsert checks it).
-- Also: only images, at most 5 MB (the app sends ~100–300 KB).
-- ============================================================

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_read_own" on storage.objects;
create policy "avatars_read_own" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';
