-- Run in Supabase SQL Editor (adds member labels for manager views)
-- Safe to run once; idempotent

ALTER TABLE public.syndicate_members
  ADD COLUMN IF NOT EXISTS display_name text;

COMMENT ON COLUMN public.syndicate_members.display_name IS 'Friendly label from profile at join; shown to managers in breakdowns.';

-- Manager row: set display_name from auth profile
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
  dn text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_allocation_mode NOT IN ('group', 'individual') THEN
    RAISE EXCEPTION 'Invalid allocation_mode';
  END IF;

  SELECT COALESCE(
    NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
    split_part(u.email, '@', 1)
  ) INTO dn
  FROM auth.users u
  WHERE u.id = auth.uid();

  INSERT INTO public.syndicates (name, allocation_mode, ground_filter, created_by)
  VALUES (trim(p_name), p_allocation_mode, NULLIF(trim(p_ground_filter), ''), auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO public.syndicate_members (syndicate_id, user_id, role, status, joined_at, display_name)
  VALUES (new_id, auth.uid(), 'manager', 'active', now(), dn);

  RETURN new_id;
END;
$$;

-- Member join: set display_name from auth profile when missing
CREATE OR REPLACE FUNCTION public.redeem_syndicate_invite(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.syndicate_invites%ROWTYPE;
  dn text;
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
