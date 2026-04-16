-- =============================================================================
-- Syndicate explicit attribution (run after existing syndicate scripts)
--
-- Goal:
--   - A cull counts to ONE syndicate at most via cull_entries.syndicate_id
--   - Personal totals are unaffected (still all user entries)
--   - Syndicate aggregate/breakdown/summary functions use explicit attribution
-- =============================================================================

ALTER TABLE public.cull_entries
  ADD COLUMN IF NOT EXISTS syndicate_id uuid
  REFERENCES public.syndicates (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cull_entries_syndicate_date
  ON public.cull_entries (syndicate_id, date);

CREATE INDEX IF NOT EXISTS idx_cull_entries_user_syndicate_date
  ON public.cull_entries (user_id, syndicate_id, date);

COMMENT ON COLUMN public.cull_entries.syndicate_id IS
  'Optional syndicate attribution for this cull. Null means personal-only entry.';

-- -----------------------------------------------------------------------------
-- Called by deleting user before cull_entries are removed
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retain_syndicate_anonymous_culls()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.syndicate_anonymous_culls (syndicate_id, season, species, sex, cull_date)
  SELECT e.syndicate_id,
         public.fl_date_to_season((e.date)::date),
         e.species,
         e.sex,
         (e.date)::date
  FROM public.cull_entries e
  INNER JOIN public.syndicate_members m
    ON m.syndicate_id = e.syndicate_id
   AND m.user_id = e.user_id
   AND m.status IN ('active', 'left')
  INNER JOIN public.syndicates s
    ON s.id = e.syndicate_id
  WHERE e.user_id = auth.uid()
    AND e.syndicate_id IS NOT NULL
    AND (
      s.ground_filter IS NULL
      OR trim(both from coalesce(e.ground, '')) = trim(both from s.ground_filter)
    );

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.retain_syndicate_anonymous_culls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retain_syndicate_anonymous_culls() TO authenticated;

-- -----------------------------------------------------------------------------
-- Aggregate actuals: explicit attribution + anonymous retained rows
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.syndicate_aggregate_actuals_for_user(
  p_syndicate_id uuid,
  p_season text
)
RETURNS TABLE (species text, sex text, actual_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_syndicate_member_active(p_syndicate_id) OR public.is_syndicate_manager(p_syndicate_id)) THEN
    RAISE EXCEPTION 'Not a member of this syndicate';
  END IF;

  RETURN QUERY
  WITH bounds AS (
    SELECT * FROM public.fl_season_bounds(p_season)
  ),
  synd AS (
    SELECT s.ground_filter FROM public.syndicates s WHERE s.id = p_syndicate_id
  ),
  members AS (
    SELECT m.user_id
    FROM public.syndicate_members m
    WHERE m.syndicate_id = p_syndicate_id AND m.status = 'active'
  ),
  live AS (
    SELECT e.species::text AS sp,
           e.sex::text AS sx,
           count(*)::bigint AS cnt
    FROM public.cull_entries e
    CROSS JOIN bounds b
    CROSS JOIN synd s
    INNER JOIN members mem ON mem.user_id = e.user_id
    WHERE e.syndicate_id = p_syndicate_id
      AND (e.date)::date BETWEEN b.d_start AND b.d_end
      AND (
        s.ground_filter IS NULL
        OR trim(both from coalesce(e.ground, '')) = trim(both from s.ground_filter)
      )
    GROUP BY e.species, e.sex
  ),
  anon AS (
    SELECT a.species::text AS sp,
           a.sex::text AS sx,
           count(*)::bigint AS cnt
    FROM public.syndicate_anonymous_culls a
    WHERE a.syndicate_id = p_syndicate_id
      AND a.season = p_season
    GROUP BY a.species, a.sex
  ),
  keys AS (
    SELECT sp, sx FROM live
    UNION
    SELECT sp, sx FROM anon
  )
  SELECT k.sp::text,
         k.sx::text,
         (COALESCE((SELECT l.cnt FROM live l WHERE l.sp = k.sp AND l.sx = k.sx), 0)
        + COALESCE((SELECT a.cnt FROM anon a WHERE a.sp = k.sp AND a.sx = k.sx), 0))::bigint
  FROM keys k;
END;
$$;

REVOKE ALL ON FUNCTION public.syndicate_aggregate_actuals_for_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.syndicate_aggregate_actuals_for_user(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- Manager-only per-cull breakdown: explicit attribution + anonymous rows
-- -----------------------------------------------------------------------------
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
    WHERE e.syndicate_id = p_syndicate_id
      AND (e.date)::date BETWEEN b.d_start AND b.d_end
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

-- -----------------------------------------------------------------------------
-- Current member's own actuals (explicit attribution only; no anonymous rows)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_syndicate_actuals(
  p_syndicate_id uuid,
  p_season text
)
RETURNS TABLE (species text, sex text, actual_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_syndicate_member_active(p_syndicate_id) THEN
    RAISE EXCEPTION 'Not a member of this syndicate';
  END IF;

  RETURN QUERY
  WITH bounds AS (
    SELECT * FROM public.fl_season_bounds(p_season)
  ),
  synd AS (
    SELECT s.ground_filter FROM public.syndicates s WHERE s.id = p_syndicate_id
  )
  SELECT e.species::text,
         e.sex::text,
         count(*)::bigint
  FROM public.cull_entries e
  CROSS JOIN bounds b
  CROSS JOIN synd s
  WHERE e.user_id = auth.uid()
    AND e.syndicate_id = p_syndicate_id
    AND (e.date)::date BETWEEN b.d_start AND b.d_end
    AND (
      s.ground_filter IS NULL
      OR trim(both from coalesce(e.ground, '')) = trim(both from s.ground_filter)
    )
  GROUP BY e.species, e.sex;
END;
$$;

REVOKE ALL ON FUNCTION public.my_syndicate_actuals(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_syndicate_actuals(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- Summary rows for stats/export (explicit attribution + anonymous retained rows)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.syndicate_season_summary(
  p_syndicate_id uuid,
  p_season text
)
RETURNS TABLE (
  species text,
  sex text,
  target_total int,
  actual_total bigint,
  my_allocation int,
  my_actual bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mode text;
  gfilter text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.is_syndicate_member_active(p_syndicate_id) OR public.is_syndicate_manager(p_syndicate_id)) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;

  SELECT s.allocation_mode, s.ground_filter INTO mode, gfilter
  FROM public.syndicates s
  WHERE s.id = p_syndicate_id;

  RETURN QUERY
  WITH bounds AS (SELECT * FROM public.fl_season_bounds(p_season)),
  members AS (
    SELECT m.user_id FROM public.syndicate_members m
    WHERE m.syndicate_id = p_syndicate_id AND m.status = 'active'
  ),
  live_cnt AS (
    SELECT e.species::text AS sp, e.sex::text AS sx, count(*)::bigint AS cnt
    FROM public.cull_entries e
    CROSS JOIN bounds b
    INNER JOIN members mem ON mem.user_id = e.user_id
    WHERE e.syndicate_id = p_syndicate_id
      AND (e.date)::date BETWEEN b.d_start AND b.d_end
      AND (gfilter IS NULL OR trim(both from coalesce(e.ground, '')) = trim(both from gfilter))
    GROUP BY e.species, e.sex
  ),
  anon_cnt AS (
    SELECT a.species::text AS sp, a.sex::text AS sx, count(*)::bigint AS cnt
    FROM public.syndicate_anonymous_culls a
    WHERE a.syndicate_id = p_syndicate_id AND a.season = p_season
    GROUP BY a.species, a.sex
  ),
  actuals_fix AS (
    SELECT keys.sp, keys.sx,
           (COALESCE(lc.cnt, 0) + COALESCE(ac.cnt, 0))::bigint AS cnt
    FROM (
      SELECT sp, sx FROM live_cnt
      UNION
      SELECT sp, sx FROM anon_cnt
    ) keys
    LEFT JOIN live_cnt lc ON lc.sp = keys.sp AND lc.sx = keys.sx
    LEFT JOIN anon_cnt ac ON ac.sp = keys.sp AND ac.sx = keys.sx
  ),
  my_act AS (
    SELECT e.species::text AS sp, e.sex::text AS sx, count(*)::bigint AS cnt
    FROM public.cull_entries e
    CROSS JOIN bounds b
    WHERE e.user_id = auth.uid()
      AND e.syndicate_id = p_syndicate_id
      AND (e.date)::date BETWEEN b.d_start AND b.d_end
      AND (gfilter IS NULL OR trim(both from coalesce(e.ground, '')) = trim(both from gfilter))
    GROUP BY e.species, e.sex
  ),
  all_keys AS (
    SELECT DISTINCT u.sp, u.sx FROM (
      SELECT st.species AS sp, st.sex AS sx FROM public.syndicate_targets st
        WHERE st.syndicate_id = p_syndicate_id AND st.season = p_season
      UNION
      SELECT ma.species AS sp, ma.sex AS sx FROM public.syndicate_member_allocations ma
        WHERE ma.syndicate_id = p_syndicate_id AND ma.season = p_season
      UNION
      SELECT sp, sx FROM actuals_fix
    ) u
  )
  SELECT
    k.sp::text AS species,
    k.sx::text AS sex,
    CASE WHEN mode = 'group' THEN
      COALESCE((SELECT t.target FROM public.syndicate_targets t
        WHERE t.syndicate_id = p_syndicate_id AND t.season = p_season AND t.species = k.sp AND t.sex = k.sx), 0)
    ELSE
      COALESCE((SELECT SUM(a.allocation)::int FROM public.syndicate_member_allocations a
        WHERE a.syndicate_id = p_syndicate_id AND a.season = p_season AND a.species = k.sp AND a.sex = k.sx), 0)
    END AS target_total,
    COALESCE((SELECT a.cnt FROM actuals_fix a WHERE a.sp = k.sp AND a.sx = k.sx), 0)::bigint AS actual_total,
    COALESCE((SELECT a.allocation FROM public.syndicate_member_allocations a
      WHERE a.syndicate_id = p_syndicate_id AND a.season = p_season AND a.species = k.sp AND a.sex = k.sx AND a.user_id = auth.uid()), 0)::int AS my_allocation,
    COALESCE((SELECT m.cnt FROM my_act m WHERE m.sp = k.sp AND m.sx = k.sx), 0)::bigint AS my_actual
  FROM all_keys k;
END;
$$;

REVOKE ALL ON FUNCTION public.syndicate_season_summary(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.syndicate_season_summary(uuid, text) TO authenticated;
