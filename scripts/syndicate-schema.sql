-- =============================================================================
-- Syndicates — First Light Cull Diary (Supabase)
-- Run once: Supabase Dashboard → SQL → New query → Paste → Run
--
-- Requires: existing public.cull_entries (user_id, date, species, sex, ground)
-- Season format: e.g. 2025-26 → 1 Aug 2025 .. 31 Jul 2026
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.syndicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  allocation_mode text NOT NULL DEFAULT 'group'
    CHECK (allocation_mode IN ('group', 'individual')),
  ground_filter text NULL,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.syndicate_members (
  syndicate_id uuid NOT NULL REFERENCES public.syndicates (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('manager', 'member')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'left')),
  invited_at timestamptz NULL,
  joined_at timestamptz NULL,
  PRIMARY KEY (syndicate_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_syndicate_members_user ON public.syndicate_members (user_id);

CREATE TABLE IF NOT EXISTS public.syndicate_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  syndicate_id uuid NOT NULL REFERENCES public.syndicates (id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  max_uses int NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
  used_count int NOT NULL DEFAULT 0 CHECK (used_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_syndicate_invites_syndicate ON public.syndicate_invites (syndicate_id);

CREATE TABLE IF NOT EXISTS public.syndicate_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  syndicate_id uuid NOT NULL REFERENCES public.syndicates (id) ON DELETE CASCADE,
  season text NOT NULL,
  species text NOT NULL,
  sex text NOT NULL CHECK (sex IN ('m', 'f')),
  target int NOT NULL CHECK (target >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (syndicate_id, season, species, sex)
);

CREATE INDEX IF NOT EXISTS idx_syndicate_targets_lookup ON public.syndicate_targets (syndicate_id, season);

CREATE TABLE IF NOT EXISTS public.syndicate_member_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  syndicate_id uuid NOT NULL REFERENCES public.syndicates (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  season text NOT NULL,
  species text NOT NULL,
  sex text NOT NULL CHECK (sex IN ('m', 'f')),
  allocation int NOT NULL CHECK (allocation >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (syndicate_id, user_id, season, species, sex)
);

CREATE INDEX IF NOT EXISTS idx_syndicate_member_alloc ON public.syndicate_member_allocations (syndicate_id, season);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fl_season_bounds(p_season text)
RETURNS TABLE (d_start date, d_end date)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    (substring(p_season from 1 for 4)::int || '-08-01')::date AS d_start,
    (((substring(p_season from 1 for 4)::int) + 1) || '-07-31')::date AS d_end;
$$;

CREATE OR REPLACE FUNCTION public.is_syndicate_manager(p_syndicate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.syndicate_members m
    WHERE m.syndicate_id = p_syndicate_id
      AND m.user_id = auth.uid()
      AND m.role = 'manager'
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_syndicate_member_active(p_syndicate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.syndicate_members m
    WHERE m.syndicate_id = p_syndicate_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  );
$$;

GRANT EXECUTE ON FUNCTION public.fl_season_bounds(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_syndicate_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_syndicate_member_active(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Create syndicate + first manager (bootstrap; use instead of raw INSERT for members)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_syndicate(
  p_name text,
  p_allocation_mode text DEFAULT 'group',
  p_ground_filter text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_allocation_mode NOT IN ('group', 'individual') THEN
    RAISE EXCEPTION 'Invalid allocation_mode';
  END IF;

  INSERT INTO public.syndicates (name, allocation_mode, ground_filter, created_by)
  VALUES (trim(p_name), p_allocation_mode, NULLIF(trim(p_ground_filter), ''), auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO public.syndicate_members (syndicate_id, user_id, role, status, joined_at)
  VALUES (new_id, auth.uid(), 'manager', 'active', now());

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_syndicate(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_syndicate(text, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- Redeem token invite
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.redeem_syndicate_invite(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.syndicate_invites%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO inv
  FROM public.syndicate_invites
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite';
  END IF;

  IF inv.expires_at < now() THEN
    RAISE EXCEPTION 'Invite expired';
  END IF;

  IF inv.used_count >= inv.max_uses THEN
    RAISE EXCEPTION 'Invite already used';
  END IF;

  INSERT INTO public.syndicate_members (syndicate_id, user_id, role, status, joined_at)
  VALUES (inv.syndicate_id, auth.uid(), 'member', 'active', now())
  ON CONFLICT (syndicate_id, user_id) DO UPDATE
    SET status = 'active',
        joined_at = COALESCE(public.syndicate_members.joined_at, now());

  UPDATE public.syndicate_invites
  SET used_count = used_count + 1
  WHERE id = inv.id;

  RETURN json_build_object('syndicate_id', inv.syndicate_id);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_syndicate_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_syndicate_invite(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- Aggregate actuals (syndicate totals — all active members)
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
  )
  SELECT e.species::text,
         e.sex::text,
         count(*)::bigint
  FROM public.cull_entries e
  CROSS JOIN bounds b
  CROSS JOIN synd s
  INNER JOIN members mem ON mem.user_id = e.user_id
  WHERE (e.date)::date BETWEEN b.d_start AND b.d_end
    AND (
      s.ground_filter IS NULL
      OR trim(both from coalesce(e.ground, '')) = trim(both from s.ground_filter)
    )
  GROUP BY e.species, e.sex;
END;
$$;

REVOKE ALL ON FUNCTION public.syndicate_aggregate_actuals_for_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.syndicate_aggregate_actuals_for_user(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- Manager only: per-member breakdown
-- -----------------------------------------------------------------------------

-- One row per qualifying diary cull with date (managers only). After syndicate-anonymous-retention.sql,
-- the live definition is replaced to UNION anonymised rows (same return shape: user_id, species, sex, cull_date).
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
  SELECT e.user_id,
         e.species::text,
         e.sex::text,
         (e.date)::date
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
  ORDER BY (e.date)::date DESC, e.species, e.sex, e.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.syndicate_member_actuals_for_manager(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.syndicate_member_actuals_for_manager(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- Current user only — own actuals vs allocation
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
-- Leave syndicate (self) — managers can only leave if another active manager exists
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.leave_syndicate_member(
  p_syndicate_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_role text;
  other_mgrs int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT m.role INTO cur_role
  FROM public.syndicate_members m
  WHERE m.syndicate_id = p_syndicate_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'
  LIMIT 1;

  IF cur_role IS NULL THEN
    RAISE EXCEPTION 'Not an active member of this syndicate';
  END IF;

  IF cur_role = 'manager' THEN
    SELECT count(*)::int INTO other_mgrs
    FROM public.syndicate_members m
    WHERE m.syndicate_id = p_syndicate_id
      AND m.status = 'active'
      AND m.role = 'manager'
      AND m.user_id <> auth.uid();

    IF other_mgrs < 1 THEN
      RAISE EXCEPTION 'Promote another manager before leaving';
    END IF;
  END IF;

  UPDATE public.syndicate_members
  SET status = 'left'
  WHERE syndicate_id = p_syndicate_id
    AND user_id = auth.uid();

  RETURN json_build_object('left', true, 'syndicate_id', p_syndicate_id);
END;
$$;

REVOKE ALL ON FUNCTION public.leave_syndicate_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_syndicate_member(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Guard: self-update on syndicate_members is leave-only for members
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_syndicate_member_self_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only constrain true "self update as member" flow. Manager updates are handled by manager policy.
  IF OLD.user_id = auth.uid() AND NOT public.is_syndicate_manager(OLD.syndicate_id) THEN
    IF OLD.role IS DISTINCT FROM 'member' THEN
      RAISE EXCEPTION 'Self update is only allowed for member leave flow';
    END IF;
    IF OLD.status IS DISTINCT FROM 'active' OR NEW.status IS DISTINCT FROM 'left' THEN
      RAISE EXCEPTION 'Members can only leave (active -> left)';
    END IF;
    IF OLD.user_id IS DISTINCT FROM NEW.user_id
       OR OLD.syndicate_id IS DISTINCT FROM NEW.syndicate_id
       OR OLD.role IS DISTINCT FROM NEW.role
       OR OLD.invited_at IS DISTINCT FROM NEW.invited_at
       OR OLD.joined_at IS DISTINCT FROM NEW.joined_at THEN
      RAISE EXCEPTION 'Only status may change during self leave';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_syndicate_members_self_leave_guard ON public.syndicate_members;
CREATE TRIGGER tr_syndicate_members_self_leave_guard
BEFORE UPDATE ON public.syndicate_members
FOR EACH ROW
EXECUTE FUNCTION public.enforce_syndicate_member_self_leave();

REVOKE ALL ON FUNCTION public.enforce_syndicate_member_self_leave() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_syndicate_member_self_leave() TO authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

ALTER TABLE public.syndicates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syndicate_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syndicate_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syndicate_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syndicate_member_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY syndicates_select_member ON public.syndicates
  FOR SELECT TO authenticated
  USING (public.is_syndicate_member_active(id) OR public.is_syndicate_manager(id));

CREATE POLICY syndicates_insert_creator ON public.syndicates
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY syndicates_update_manager ON public.syndicates
  FOR UPDATE TO authenticated
  USING (public.is_syndicate_manager(id))
  WITH CHECK (public.is_syndicate_manager(id));

CREATE POLICY syndicates_delete_manager ON public.syndicates
  FOR DELETE TO authenticated
  USING (public.is_syndicate_manager(id));

CREATE POLICY syndicate_members_select ON public.syndicate_members
  FOR SELECT TO authenticated
  USING (
    public.is_syndicate_member_active(syndicate_id)
    OR public.is_syndicate_manager(syndicate_id)
  );

CREATE POLICY syndicate_members_insert_manager ON public.syndicate_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_syndicate_manager(syndicate_id));

CREATE POLICY syndicate_members_update_manager ON public.syndicate_members
  FOR UPDATE TO authenticated
  USING (public.is_syndicate_manager(syndicate_id))
  WITH CHECK (public.is_syndicate_manager(syndicate_id));

CREATE POLICY syndicate_members_update_self_leave ON public.syndicate_members
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND role = 'member'
    AND status = 'active'
  )
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'member'
    AND status = 'left'
  );

CREATE POLICY syndicate_invites_select_manager ON public.syndicate_invites
  FOR SELECT TO authenticated
  USING (public.is_syndicate_manager(syndicate_id));

CREATE POLICY syndicate_invites_insert_manager ON public.syndicate_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_syndicate_manager(syndicate_id)
    AND created_by = auth.uid()
  );

CREATE POLICY syndicate_invites_update_manager ON public.syndicate_invites
  FOR UPDATE TO authenticated
  USING (public.is_syndicate_manager(syndicate_id))
  WITH CHECK (public.is_syndicate_manager(syndicate_id));

CREATE POLICY syndicate_invites_delete_manager ON public.syndicate_invites
  FOR DELETE TO authenticated
  USING (public.is_syndicate_manager(syndicate_id));

CREATE POLICY syndicate_targets_select_members ON public.syndicate_targets
  FOR SELECT TO authenticated
  USING (public.is_syndicate_member_active(syndicate_id));

CREATE POLICY syndicate_targets_all_manager ON public.syndicate_targets
  FOR ALL TO authenticated
  USING (public.is_syndicate_manager(syndicate_id))
  WITH CHECK (public.is_syndicate_manager(syndicate_id));

CREATE POLICY syndicate_alloc_select_own_or_manager ON public.syndicate_member_allocations
  FOR SELECT TO authenticated
  USING (
    public.is_syndicate_manager(syndicate_id)
    OR (user_id = auth.uid() AND public.is_syndicate_member_active(syndicate_id))
  );

CREATE POLICY syndicate_alloc_all_manager ON public.syndicate_member_allocations
  FOR ALL TO authenticated
  USING (public.is_syndicate_manager(syndicate_id))
  WITH CHECK (public.is_syndicate_manager(syndicate_id));
