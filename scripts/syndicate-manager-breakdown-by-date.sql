-- =============================================================================
-- Patch: manager “culled by member” list shows one row per cull WITH date
-- (replaces aggregated counts). Run in Supabase SQL if you already deployed
-- earlier syndicate RPCs.
--
-- Return type changed from (…, actual_count bigint) to (…, cull_date date).
-- PostgreSQL requires DROP before CREATE when OUT parameters change.
-- Same logic as syndicate_member_actuals_for_manager in
-- scripts/syndicate-anonymous-retention.sql (includes anonymised rows).
-- =============================================================================

DROP FUNCTION IF EXISTS public.syndicate_member_actuals_for_manager(uuid, text);

CREATE OR REPLACE FUNCTION public.syndicate_member_actuals_for_manager(
  p_syndicate_id uuid,
  p_season text
)
RETURNS TABLE (user_id uuid, species text, sex text, cull_date date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_syndicate_manager(p_syndicate_id) THEN
    RAISE EXCEPTION 'Manager only';
  END IF;

  RETURN QUERY
  WITH bounds AS (
    SELECT * FROM public.fl_season_bounds(p_season)
  ),
  synd AS (
    SELECT s.ground_filter FROM public.syndicates s WHERE s.id = p_syndicate_id
  )
  SELECT x.user_id, x.species, x.sex, x.cull_date
  FROM (
    SELECT e.user_id,
           e.species::text AS species,
           e.sex::text AS sex,
           (e.date)::date AS cull_date
    FROM public.cull_entries e
    CROSS JOIN bounds b
    CROSS JOIN synd s
    INNER JOIN public.syndicate_members m
      ON m.syndicate_id = p_syndicate_id
     AND m.user_id = e.user_id
     AND m.status = 'active'
    WHERE (e.date)::date BETWEEN b.d_start AND b.d_end
      AND (
        s.ground_filter IS NULL
        OR trim(both from coalesce(e.ground, '')) = trim(both from s.ground_filter)
      )
    UNION ALL
    SELECT NULL::uuid,
           a.species::text,
           a.sex::text,
           a.cull_date
    FROM public.syndicate_anonymous_culls a
    WHERE a.syndicate_id = p_syndicate_id
      AND a.season = p_season
  ) x
  ORDER BY x.cull_date DESC, x.species, x.sex, x.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.syndicate_member_actuals_for_manager(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.syndicate_member_actuals_for_manager(uuid, text) TO authenticated;
