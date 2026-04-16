-- Manager leave hardening:
-- adds RPC for safe self-leave and enforces "another manager must exist" for manager exits.

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
