
-- Fix infinite recursion between shops and shop_assignments RLS policies
-- by routing existence checks through SECURITY DEFINER functions.

CREATE OR REPLACE FUNCTION public.user_has_active_shop_assignment(_user_id uuid, _shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_assignments
    WHERE shop_id = _shop_id AND assigned_to = _user_id AND active
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_team_lead_for_shop(_user_id uuid, _shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.team_members tm ON tm.team_id = s.team_id
    WHERE s.id = _shop_id AND tm.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_team_lead_for_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = _team_id AND tm.user_id = _user_id
  );
$$;

-- Replace shops policies
DROP POLICY IF EXISTS "Salespersons view shops assigned to them" ON public.shops;
DROP POLICY IF EXISTS "Team leads manage own team shops" ON public.shops;

CREATE POLICY "Salespersons view shops assigned to them"
ON public.shops FOR SELECT TO authenticated
USING (public.user_has_active_shop_assignment(auth.uid(), id));

CREATE POLICY "Team leads manage own team shops"
ON public.shops FOR ALL TO authenticated
USING (has_role(auth.uid(), 'team_lead') AND public.user_is_team_lead_for_team(auth.uid(), team_id))
WITH CHECK (has_role(auth.uid(), 'team_lead') AND public.user_is_team_lead_for_team(auth.uid(), team_id));

-- Replace shop_assignments policy
DROP POLICY IF EXISTS "Team leads manage assignments for team shops" ON public.shop_assignments;

CREATE POLICY "Team leads manage assignments for team shops"
ON public.shop_assignments FOR ALL TO authenticated
USING (has_role(auth.uid(), 'team_lead') AND public.user_is_team_lead_for_shop(auth.uid(), shop_id))
WITH CHECK (has_role(auth.uid(), 'team_lead') AND public.user_is_team_lead_for_shop(auth.uid(), shop_id));
