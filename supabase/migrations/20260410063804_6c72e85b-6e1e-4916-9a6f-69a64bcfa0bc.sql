
-- Team leads can view all expenses
CREATE POLICY "Team leads can view all expenses"
ON public.expenses FOR SELECT
USING (has_role(auth.uid(), 'team_lead'));

-- Team leads can update expenses (approve/reject)
CREATE POLICY "Team leads can update expenses"
ON public.expenses FOR UPDATE
USING (has_role(auth.uid(), 'team_lead'));
