-- Harden syndicate_members self-update path:
-- members can only perform active -> left on their own row (leave),
-- and cannot alter role/syndicate/user/joined metadata.

DROP POLICY IF EXISTS syndicate_members_update_self_leave ON public.syndicate_members;

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
