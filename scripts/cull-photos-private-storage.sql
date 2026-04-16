-- =============================================================================
-- First Light — Make cull-photos private (owner-only reads)
-- Run in Supabase → SQL Editor after backing up if needed.
--
-- Deploy order: ship diary.js (signed URLs + path storage) first, then run this.
-- After this script, legacy public object URLs return 403 for unauthenticated users.
-- =============================================================================

-- Bucket: do not expose objects without auth + RLS
UPDATE storage.buckets
SET public = false
WHERE id = 'cull-photos';

-- Replace permissive public read with same folder rule as writes
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;

CREATE POLICY "Allow authenticated reads own folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'cull-photos'
  AND split_part(name, '/'::text, 1) = (auth.uid())::text
);
