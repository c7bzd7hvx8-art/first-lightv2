-- =============================================================================
-- First Light — DRIFT CHECK (run in Supabase SQL Editor)
--
-- Purpose: returns rows ONLY when something the app expects is MISSING or OFF.
-- Empty result = no drift detected for these checks.
--
-- Use scripts/supabase-audit-queries.sql for a full inventory snapshot
-- (tables, functions, counts). Use THIS file for quick “what’s not applied?”
-- without re-reading long baseline outputs.
--
-- Safe: read-only SELECTs.
-- =============================================================================

-- 1) Expected public tables (add a row here when you add a migration)
WITH expected_tables(tbl) AS (
  VALUES
    ('cull_entries'),
    ('cull_targets'),
    ('grounds'),
    ('ground_targets'),
    ('syndicates'),
    ('syndicate_members'),
    ('syndicate_invites'),
    ('syndicate_targets'),
    ('syndicate_member_allocations'),
    ('syndicate_anonymous_culls')
),
have_tbl AS (
  SELECT c.relname::text AS tbl
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
)
SELECT 'missing_table'::text AS drift_type,
       e.tbl::text AS name,
       'Create/migrate this table (see scripts/*.sql)'::text AS hint
FROM expected_tables e
LEFT JOIN have_tbl h ON h.tbl = e.tbl
WHERE h.tbl IS NULL

UNION ALL

-- 2) Expected functions (add a name when diary.js / RPCs gain a dependency)
SELECT 'missing_function'::text,
       e.fn::text,
       'Deploy function from scripts (syndicate-schema.sql, syndicate-anonymous-retention.sql, etc.)'::text
FROM (
  VALUES
    ('fl_date_to_season'),
    ('fl_season_bounds'),
    ('retain_syndicate_anonymous_culls'),
    ('is_syndicate_manager'),
    ('is_syndicate_member_active'),
    ('create_syndicate'),
    ('redeem_syndicate_invite'),
    ('leave_syndicate_member'),
    ('syndicate_aggregate_actuals_for_user'),
    ('syndicate_member_actuals_for_manager'),
    ('my_syndicate_actuals'),
    ('syndicate_season_summary'),
    ('delete_user')
) AS e(fn)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = e.fn::name
)

UNION ALL

-- 3) syndicate_members.display_name (member labels)
SELECT 'missing_column'::text,
       'syndicate_members.display_name'::text,
       'Run scripts/syndicate-member-display-name.sql'::text
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'syndicate_members'
    AND column_name = 'display_name'
)

UNION ALL

-- 3b) Explicit syndicate attribution on diary entries
SELECT 'missing_column'::text,
       'cull_entries.syndicate_id'::text,
       'Run scripts/syndicate-explicit-attribution.sql'::text
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'cull_entries'
    AND column_name = 'syndicate_id'
)

UNION ALL

-- 3c) self-leave hardening trigger must exist
SELECT 'missing_trigger'::text,
       'tr_syndicate_members_self_leave_guard'::text,
       'Run scripts/syndicate-rls-self-leave-hardening.sql'::text
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'syndicate_members'
    AND t.tgname = 'tr_syndicate_members_self_leave_guard'
    AND NOT t.tgisinternal
)

UNION ALL

-- 3d) self-leave policy should be restricted to member active -> left
SELECT 'weak_policy'::text,
       'syndicate_members_update_self_leave'::text,
       'Run scripts/syndicate-rls-self-leave-hardening.sql'::text
WHERE EXISTS (
  SELECT 1
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'syndicate_members'
    AND p.policyname = 'syndicate_members_update_self_leave'
)
AND NOT EXISTS (
  SELECT 1
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'syndicate_members'
    AND p.policyname = 'syndicate_members_update_self_leave'
    AND p.qual ILIKE '%user_id = auth.uid()%'
    AND p.qual ILIKE '%role = ''member''%'
    AND p.qual ILIKE '%status = ''active''%'
    AND p.with_check ILIKE '%user_id = auth.uid()%'
    AND p.with_check ILIKE '%role = ''member''%'
    AND p.with_check ILIKE '%status = ''left''%'
)

UNION ALL

-- 3e) redeem_syndicate_invite should include already-member short-circuit
SELECT 'weak_function'::text,
       'redeem_syndicate_invite(text)'::text,
       'Run scripts/syndicate-redeem-invite-fix.sql (or latest syndicate SQL set)'::text
WHERE EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'redeem_syndicate_invite'::name
    AND pg_get_function_identity_arguments(p.oid) = 'p_token text'
)
AND NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'redeem_syndicate_invite'::name
    AND pg_get_function_identity_arguments(p.oid) = 'p_token text'
    AND pg_get_functiondef(p.oid) ILIKE '%already_member%'
    AND pg_get_functiondef(p.oid) ILIKE '%IF mem_status = ''active''%'
)

UNION ALL

-- 3f) leave_syndicate_member should enforce manager handoff
SELECT 'weak_function'::text,
       'leave_syndicate_member(uuid)'::text,
       'Run scripts/syndicate-manager-leave-transfer.sql'::text
WHERE EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'leave_syndicate_member'::name
    AND pg_get_function_identity_arguments(p.oid) = 'p_syndicate_id uuid'
)
AND NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'leave_syndicate_member'::name
    AND pg_get_function_identity_arguments(p.oid) = 'p_syndicate_id uuid'
    AND pg_get_functiondef(p.oid) ILIKE '%Promote another manager before leaving%'
    AND pg_get_functiondef(p.oid) ILIKE '%m.role = ''manager''%'
)

UNION ALL

-- 3g) syndicate summary must use explicit attribution (no personal-season-only source)
SELECT 'weak_function'::text,
       'syndicate_season_summary(uuid,text)'::text,
       'Run scripts/syndicate-explicit-attribution.sql'::text
WHERE EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'syndicate_season_summary'::name
    AND pg_get_function_identity_arguments(p.oid) = 'p_syndicate_id uuid, p_season text'
)
AND NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'syndicate_season_summary'::name
    AND pg_get_function_identity_arguments(p.oid) = 'p_syndicate_id uuid, p_season text'
    AND pg_get_functiondef(p.oid) ILIKE '%e.syndicate_id = p_syndicate_id%'
)

UNION ALL

-- 3h) manager breakdown should include anonymous retained rows union
SELECT 'weak_function'::text,
       'syndicate_member_actuals_for_manager(uuid,text)'::text,
       'Run scripts/syndicate-explicit-attribution.sql'::text
WHERE EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'syndicate_member_actuals_for_manager'::name
    AND pg_get_function_identity_arguments(p.oid) = 'p_syndicate_id uuid, p_season text'
)
AND NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'syndicate_member_actuals_for_manager'::name
    AND pg_get_function_identity_arguments(p.oid) = 'p_syndicate_id uuid, p_season text'
    AND pg_get_functiondef(p.oid) ILIKE '%UNION ALL%'
    AND pg_get_functiondef(p.oid) ILIKE '%NULL::uuid%'
)

UNION ALL

-- 4) Storage bucket for diary photos
SELECT 'missing_storage_bucket'::text,
       'cull-photos'::text,
       'Dashboard → Storage → New bucket, or SQL insert into storage.buckets'::text
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'cull-photos'
)

UNION ALL

-- 5) RLS enabled on syndicate_anonymous_culls (if table exists)
SELECT 'rls_disabled'::text,
       'syndicate_anonymous_culls'::text,
       'ALTER TABLE ... ENABLE ROW LEVEL SECURITY + policies'::text
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'syndicate_anonymous_culls'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity

ORDER BY 1, 2;
