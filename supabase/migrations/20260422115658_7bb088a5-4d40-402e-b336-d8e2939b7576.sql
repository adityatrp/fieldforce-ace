
-- Restrict team_lead access to visits to only same-team members.
-- Admins keep full access. Salespersons keep their own access.

-- Helper function: same team membership between two users (SECURITY DEFINER to avoid RLS recursion on team_members)
CREATE OR REPLACE FUNCTION public.users_share_team(_user_a uuid, _user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tma
    JOIN public.team_members tmb ON tma.team_id = tmb.team_id
    WHERE tma.user_id = _user_a
      AND tmb.user_id = _user_b
  );
$$;

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Leads and admins can view all visits" ON public.visits;
DROP POLICY IF EXISTS "Leads and admins can create visits" ON public.visits;
DROP POLICY IF EXISTS "Admins can update any visit" ON public.visits;

-- Admins: full SELECT
CREATE POLICY "Admins can view all visits"
ON public.visits
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Team leads: SELECT only visits assigned to users in their team(s)
CREATE POLICY "Team leads can view team visits"
ON public.visits
FOR SELECT
USING (
  public.has_role(auth.uid(), 'team_lead'::app_role)
  AND assigned_to IS NOT NULL
  AND public.users_share_team(auth.uid(), assigned_to)
);

-- Admins: INSERT any
CREATE POLICY "Admins can create visits"
ON public.visits
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Team leads: INSERT only for users in their team
CREATE POLICY "Team leads can create visits for team"
ON public.visits
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'team_lead'::app_role)
  AND assigned_to IS NOT NULL
  AND public.users_share_team(auth.uid(), assigned_to)
);

-- Admins: UPDATE any
CREATE POLICY "Admins can update any visit"
ON public.visits
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Team leads: UPDATE only for visits in their team
CREATE POLICY "Team leads can update team visits"
ON public.visits
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'team_lead'::app_role)
  AND assigned_to IS NOT NULL
  AND public.users_share_team(auth.uid(), assigned_to)
);
