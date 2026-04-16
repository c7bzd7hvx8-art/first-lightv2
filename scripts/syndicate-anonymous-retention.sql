-- =============================================================================
-- Syndicate anonymous cull retention (run in Supabase SQL Editor after
-- syndicate-schema.sql + syndicate-summary-rpc.sql)
--
-- When a user deletes their account, diary rows are removed but anonymised
-- species/sex/date (per syndicate season) are kept for syndicate totals.
-- =============================================================================

-- Calendar date → season label (e.g. 2025-09-15 → '2025-26'), matches fl_season_bounds
CREATE OR REPLACE FUNCTION public.fl_date_to_season(d date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (CASE WHEN EXTRACT(MONTH FROM d)::int >= 8
    THEN EXTRACT(YEAR FROM d)::int
    ELSE EXTRACT(YEAR FROM d)::int - 1
  END)::text || '-' ||
  lpad(((((CASE WHEN EXTRACT(MONTH FROM d)::int >= 8
    THEN EXTRACT(YEAR FROM d)::int
    ELSE EXTRACT(YEAR FROM d)::int - 1
  END) + 1) % 100)::text), 2, '0');
$$;

REVOKE ALL ON FUNCTION public.fl_date_to_season(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fl_date_to_season(date) TO authenticated;

-- No user_id: not attributable to an individual after account deletion
CREATE TABLE IF NOT EXISTS public.syndicate_anonymous_culls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  syndicate_id uuid NOT NULL REFERENCES public.syndicates (id) ON DELETE CASCADE,
  season text NOT NULL,
  species text NOT NULL,
  sex text NOT NULL CHECK (sex IN ('m', 'f')),
  cull_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_syndicate_anon_culls_lookup
  ON public.syndicate_anonymous_culls (syndicate_id, season);

COMMENT ON TABLE public.syndicate_anonymous_culls IS
  'Anonymised species/sex/date retained when a member deletes their account; syndicate totals only.';

ALTER TABLE public.syndicate_anonymous_culls ENABLE ROW LEVEL SECURITY;

CREATE POLICY syndicate_anonymous_culls_select_member
  ON public.syndicate_anonymous_culls
  FOR SELECT TO authenticated
  USING (
    public.is_syndicate_member_active(syndicate_id)
    OR public.is_syndicate_manager(syndicate_id)
  );

GRANT SELECT ON public.syndicate_anonymous_culls TO authenticated;

-- Called by the deleting user (session) before cull_entries are removed
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
  SELECT m.syndicate_id,
         public.fl_date_to_season((e.date)::date),
         e.species,
         e.sex,
         (e.date)::date
  FROM public.cull_entries e
  INNER JOIN public.syndicate_members m
    ON m.user_id = e.user_id
   AND m.status IN ('active', 'left')
  INNER JOIN public.syndicates s ON s.id = m.syndicate_id
  WHERE e.user_id = auth.uid()
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

-- ---------------------------------------------------------------------------
-- Aggregates: live member entries + anonymised retained rows
-- ---------------------------------------------------------------------------

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
    WHERE (e.date)::date BETWEEN b.d_start AND b.d_end
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

-- One row per cull (with date). Anonymous retained rows have NULL user_id.
-- DROP required if upgrading from older return type (actual_count bigint → cull_date date).
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

  SELECT s.allocation_mode, s.ground_filter INTO mode, gfilter FROM public.syndicates s WHERE s.id = p_syndicate_id;

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
    WHERE (e.date)::date BETWEEN b.d_start AND b.d_end
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
      AND (e.date)::date BETWEEN b.d_start AND b.d_end
      AND (gfilter IS NULL OR trim(both from coalesce(e.ground, '')) = trim(both from gfilter))
    GROUP BY e.species, e.sex
  ),
  all_keys AS (
    SELECT DISTINCT u.sp, u.sx FROM (
      -- Qualify columns: RETURNS TABLE (species, sex, ...) shadows bare names in this function
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
