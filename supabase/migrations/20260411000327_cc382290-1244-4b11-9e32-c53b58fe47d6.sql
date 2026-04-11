
-- Fix overly permissive INSERT on visit_order_items
DROP POLICY "Salespersons can insert order items" ON public.visit_order_items;
CREATE POLICY "Salespersons can insert order items for their visits" ON public.visit_order_items 
  FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.visits WHERE visits.id = visit_id AND visits.assigned_to = auth.uid())
  );

-- Fix overly permissive INSERT on team_members for leads (scope to their team)
DROP POLICY "Team leads can insert team members" ON public.team_members;
CREATE POLICY "Team leads can insert team members" ON public.team_members 
  FOR INSERT 
  WITH CHECK (
    public.has_role(auth.uid(), 'team_lead') AND 
    EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_id AND tm.user_id = auth.uid())
  );
