-- Run after syndicate-schema.sql — summary rows for Stats UI (group + individual totals).
-- If you use anonymous syndicate retention on account delete, run scripts/syndicate-anonymous-retention.sql
-- afterward (it replaces syndicate_season_summary to include retained anonymised counts).
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
  actuals AS (
    SELECT e.species::text AS sp, e.sex::text AS sx, count(*)::bigint AS cnt
    FROM public.cull_entries e
    CROSS JOIN bounds b
    INNER JOIN members mem ON mem.user_id = e.user_id
    WHERE (e.date)::date BETWEEN b.d_start AND b.d_end
      AND (gfilter IS NULL OR trim(both from coalesce(e.ground, '')) = trim(both from gfilter))
    GROUP BY e.species, e.sex
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
      SELECT sp, sx FROM actuals
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
    COALESCE((SELECT a.cnt FROM actuals a WHERE a.sp = k.sp AND a.sx = k.sx), 0)::bigint AS actual_total,
    COALESCE((SELECT a.allocation FROM public.syndicate_member_allocations a
      WHERE a.syndicate_id = p_syndicate_id AND a.season = p_season AND a.species = k.sp AND a.sex = k.sx AND a.user_id = auth.uid()), 0)::int AS my_allocation,
    COALESCE((SELECT m.cnt FROM my_act m WHERE m.sp = k.sp AND m.sx = k.sx), 0)::bigint AS my_actual
  FROM all_keys k;
END;
$$;

REVOKE ALL ON FUNCTION public.syndicate_season_summary(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.syndicate_season_summary(uuid, text) TO authenticated;
