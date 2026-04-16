-- =============================================================================
-- First Light — read-only Supabase snapshot (Dashboard → SQL → paste → Run)
-- Use results to see what exists vs what diary.js expects. Safe: SELECT only.
-- Save outputs in: scripts/supabase-audit-snapshot.json (update _meta.captured when refreshing)
--
-- For quick “what migrations are still missing?” with NO long baseline to compare,
-- run scripts/supabase-verify-drift.sql instead — it returns rows ONLY on drift.
-- =============================================================================

-- --- Tables the app touches (public schema) ---
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name IN (
    'cull_entries',
    'cull_targets',
    'grounds',
    'ground_targets',
    'syndicates',
    'syndicate_members',
    'syndicate_invites',
    'syndicate_targets',
    'syndicate_member_allocations',
    'syndicate_anonymous_culls'
  )
ORDER BY table_name;

-- --- RPCs / functions the app calls (public + auth-related name) ---
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND p.proname IN (
    'fl_date_to_season',
    'fl_season_bounds',
    'retain_syndicate_anonymous_culls',
    'is_syndicate_manager',
    'is_syndicate_member_active',
    'create_syndicate',
    'redeem_syndicate_invite',
    'syndicate_aggregate_actuals_for_user',
    'syndicate_member_actuals_for_manager',
    'my_syndicate_actuals',
    'syndicate_season_summary',
    'delete_user'
  )
ORDER BY p.proname;

-- --- Column check: syndicate_members.display_name (member labels in UI) ---
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'syndicate_members'
  AND column_name = 'display_name';

-- --- Row counts (sanity; optional) ---
SELECT 'cull_entries' AS tbl, COUNT(*)::bigint AS n FROM public.cull_entries
UNION ALL SELECT 'syndicates', COUNT(*) FROM public.syndicates
UNION ALL SELECT 'syndicate_members', COUNT(*) FROM public.syndicate_members
UNION ALL SELECT 'syndicate_anonymous_culls', COUNT(*) FROM public.syndicate_anonymous_culls;

-- =============================================================================
-- Storage: create bucket `cull-photos` in Dashboard → Storage if missing.
-- Policies are not listed here — verify in Storage → Policies.
-- =============================================================================
