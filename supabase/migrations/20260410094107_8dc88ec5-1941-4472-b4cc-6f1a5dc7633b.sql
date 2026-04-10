
-- Allow team leads to view all user_roles
CREATE POLICY "Team leads can view all roles"
ON public.user_roles FOR SELECT
USING (has_role(auth.uid(), 'team_lead'::app_role));
