-- =============================================================================
-- First Light — RLS + Storage policies (Dashboard → SQL → Run)
-- Paste ALL result sets into chat or into scripts/supabase-audit-rls-snapshot.json
-- After updating the JSON, set _meta.captured to today (YYYY-MM-DD) and run:
--   node scripts/validate-rls-snapshot.mjs
-- CI: .github/workflows/rls-snapshot-validate.yml (weekly stale check: 75 days)
-- =============================================================================

-- 1) Which public tables have RLS enabled?
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'cull_entries', 'cull_targets', 'grounds', 'ground_targets',
    'syndicates', 'syndicate_members', 'syndicate_invites',
    'syndicate_targets', 'syndicate_member_allocations',
    'syndicate_anonymous_culls'
  )
ORDER BY c.relname;

-- 2) All row policies on those public tables (definitions + roles)
SELECT schemaname,
       tablename,
       policyname,
       permissive,
       roles,
       cmd,
       qual,
       with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'cull_entries', 'cull_targets', 'grounds', 'ground_targets',
    'syndicates', 'syndicate_members', 'syndicate_invites',
    'syndicate_targets', 'syndicate_member_allocations',
    'syndicate_anonymous_culls'
  )
ORDER BY tablename, policyname;

-- 3) Storage: policies on storage.objects (cull-photos uploads)
SELECT schemaname,
       tablename,
       policyname,
       permissive,
       roles,
       cmd,
       qual,
       with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename IN ('objects', 'buckets')
ORDER BY tablename, policyname;
