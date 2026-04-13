
-- Allow team leads to manage targets for their team members
CREATE POLICY "Team leads can insert targets"
ON public.targets
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'team_lead'::app_role));

CREATE POLICY "Team leads can update targets"
ON public.targets
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'team_lead'::app_role));

CREATE POLICY "Team leads can view all targets"
ON public.targets
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'team_lead'::app_role));
