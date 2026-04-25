-- 1. Restrict realtime channel subscriptions to authenticated users only.
--    For postgres_changes, table-level RLS still filters payloads per row,
--    but realtime.messages itself needs RLS to prevent unauthenticated topic subscriptions.
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can receive realtime messages" ON realtime.messages;
CREATE POLICY "Authenticated users can receive realtime messages"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can send realtime messages" ON realtime.messages;
CREATE POLICY "Authenticated users can send realtime messages"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 2. Add DELETE policies on visit_order_items so edit-order flow doesn't silently fail.
DROP POLICY IF EXISTS "Salespersons delete own visit order items" ON public.visit_order_items;
CREATE POLICY "Salespersons delete own visit order items"
  ON public.visit_order_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_order_items.visit_id
        AND v.assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Leads and admins delete order items" ON public.visit_order_items;
CREATE POLICY "Leads and admins delete order items"
  ON public.visit_order_items
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'team_lead'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 3. Restrict team_lead DELETE on team_members to only their own team.
DROP POLICY IF EXISTS "Team leads can delete team members" ON public.team_members;
CREATE POLICY "Team leads can delete team members"
  ON public.team_members
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'team_lead'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
    )
  );

-- 4. Restrict team_lead expense access to users in the same team.
DROP POLICY IF EXISTS "Team leads can view all expenses" ON public.expenses;
CREATE POLICY "Team leads can view team expenses"
  ON public.expenses
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'team_lead'::public.app_role)
    AND public.users_share_team(auth.uid(), user_id)
  );

DROP POLICY IF EXISTS "Team leads can update expenses" ON public.expenses;
CREATE POLICY "Team leads can update team expenses"
  ON public.expenses
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'team_lead'::public.app_role)
    AND public.users_share_team(auth.uid(), user_id)
  );