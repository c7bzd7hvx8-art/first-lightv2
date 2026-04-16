-- Fix: do not increment syndicate_invites.used_count when the user is already an active member
-- (avoids burning invites and wrong max_uses accounting). Run after syndicate-schema.sql / member display migration.

CREATE OR REPLACE FUNCTION public.redeem_syndicate_invite(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.syndicate_invites%ROWTYPE;
  dn text;
  mem_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(
    NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
    split_part(u.email, '@', 1)
  ) INTO dn
  FROM auth.users u
  WHERE u.id = auth.uid();

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

  SELECT m.status INTO mem_status
  FROM public.syndicate_members m
  WHERE m.syndicate_id = inv.syndicate_id AND m.user_id = auth.uid();

  IF mem_status = 'active' THEN
    RETURN json_build_object('syndicate_id', inv.syndicate_id, 'already_member', true);
  END IF;

  INSERT INTO public.syndicate_members (syndicate_id, user_id, role, status, joined_at, display_name)
  VALUES (inv.syndicate_id, auth.uid(), 'member', 'active', now(), dn)
  ON CONFLICT (syndicate_id, user_id) DO UPDATE
    SET status = 'active',
        joined_at = COALESCE(public.syndicate_members.joined_at, now()),
        display_name = COALESCE(
          NULLIF(trim(public.syndicate_members.display_name), ''),
          EXCLUDED.display_name
        );

  UPDATE public.syndicate_invites
  SET used_count = used_count + 1
  WHERE id = inv.id;

  RETURN json_build_object('syndicate_id', inv.syndicate_id);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_syndicate_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_syndicate_invite(text) TO authenticated;
