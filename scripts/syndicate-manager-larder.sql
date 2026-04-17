-- =============================================================================
-- Team Larder Book RPC for syndicate managers
--
-- Purpose: a single manager-facing larder book that lists every carcass a
-- syndicate's active members have entered into their own diaries in a season,
-- scoped to the syndicate's explicit per-entry attribution (and preserved
-- optional ground_filter as a belt-and-braces check). Produces the same
-- column set the single-user Larder Book PDF uses, plus a `user_id` so the
-- UI can join member display names.
--
-- Attribution model:
--   * Each row of `cull_entries` carries a nullable `syndicate_id` set when
--     the shooter tagged that carcass to a particular syndicate at entry
--     time. This RPC filters on it (same as `syndicate_season_summary` and
--     `syndicate_member_actuals_for_manager` post the 2026-04-15 explicit-
--     attribution migration). Without this filter a no-ground-filter
--     syndicate (e.g. an individual-allocation one) would swallow entries
--     a member tagged to a different syndicate.
--   * `ground_filter` is retained as a redundant consistency check: if the
--     manager has set one on the syndicate, rows that happen to carry the
--     syndicate_id but a mismatching ground are still excluded. Belt-and-
--     braces — a manager can't accidentally bring sacks of someone else's
--     permission into the larder book even if an entry's syndicate_id is
--     mistyped.
--
-- Differences vs `syndicate_member_actuals_for_manager`:
--   * Returns the full larder payload (tag, weight, age, destination, ground,
--     location, calibre, gralloch abnormalities) rather than just species/sex
--     aggregates.
--   * Does NOT include `syndicate_anonymous_culls`. When a member deletes
--     their account, we only retain {species, sex, cull_date} for syndicate
--     totals — there is no tag / weight / destination to put in a larder book,
--     and a larder book with half-empty rows would read as a compliance risk.
--     Live member rows only.
--   * Filters out destinations classified "left on hill" (case-insensitive):
--     the carcass never entered the larder, so it never belongs in a larder
--     book. Consistent with the single-user export.
--
-- Auth: SECURITY DEFINER + is_syndicate_manager() guard. Only managers can
-- call this; anon/members get "Manager only".
--
-- Run in Supabase SQL Editor after `migrate-add-abnormalities.sql` (this RPC
-- references the `abnormalities` / `abnormalities_other` columns) and after
-- `syndicate-explicit-attribution.sql` (this RPC references
-- `cull_entries.syndicate_id`).
-- Idempotent — safe to re-run on schema/policy changes.
--
-- Changelog:
--   2026-04-16 v2  Added explicit `e.syndicate_id = p_syndicate_id` guard.
--                  v1 (initial) filtered only on member roster + ground_filter,
--                  which caused a no-filter syndicate to swallow entries
--                  attributed to a sibling syndicate sharing the same member.
--   2026-04-16 v1  Initial.
-- =============================================================================

DROP FUNCTION IF EXISTS public.syndicate_member_larder_for_manager(uuid, text);

CREATE OR REPLACE FUNCTION public.syndicate_member_larder_for_manager(
  p_syndicate_id uuid,
  p_season text
)
RETURNS TABLE (
  entry_id uuid,
  user_id uuid,
  cull_date date,
  cull_time text,
  species text,
  sex text,
  tag_number text,
  weight_kg numeric,
  age_class text,
  destination text,
  ground text,
  location_name text,
  calibre text,
  abnormalities text[],
  abnormalities_other text
)
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
  SELECT e.id AS entry_id,
         e.user_id,
         (e.date)::date AS cull_date,
         e.time::text AS cull_time,
         e.species::text,
         e.sex::text,
         e.tag_number::text,
         e.weight_kg,
         e.age_class::text,
         e.destination::text,
         e.ground::text,
         e.location_name::text,
         e.calibre::text,
         e.abnormalities,
         e.abnormalities_other
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
    AND lower(coalesce(e.destination, '')) <> 'left on hill'
  ORDER BY (e.date)::date ASC,
           e.time ASC NULLS LAST,
           e.species, e.sex;
END;
$$;

REVOKE ALL ON FUNCTION public.syndicate_member_larder_for_manager(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.syndicate_member_larder_for_manager(uuid, text) TO authenticated;
