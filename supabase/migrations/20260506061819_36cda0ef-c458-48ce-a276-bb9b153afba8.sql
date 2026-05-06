CREATE POLICY "Salespersons can create visits for active assigned shops"
ON public.visits
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = assigned_to
  AND auth.uid() = user_id
  AND assignment_id IS NOT NULL
  AND shop_id IS NOT NULL
  AND public.user_has_active_shop_assignment(auth.uid(), shop_id)
);