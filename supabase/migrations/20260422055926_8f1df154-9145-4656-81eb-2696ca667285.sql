-- 1. Fix broken team_members INSERT policy (self-referencing bug)
DROP POLICY IF EXISTS "Team leads can insert team members" ON public.team_members;

CREATE POLICY "Team leads can insert team members"
ON public.team_members
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'team_lead'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
  )
);

-- 2. Tighten visit_order_items SELECT policy
DROP POLICY IF EXISTS "Users can view order items for their visits" ON public.visit_order_items;

CREATE POLICY "Salespersons view own visit order items"
ON public.visit_order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.visits v
    WHERE v.id = visit_order_items.visit_id
      AND v.assigned_to = auth.uid()
  )
);

CREATE POLICY "Leads and admins view all order items"
ON public.visit_order_items
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'team_lead'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 3. Make photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'photos';

-- 4. Replace photos bucket policies with ownership-scoped ones
DROP POLICY IF EXISTS "Anyone can view photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete photos" ON storage.objects;

-- Path convention used by the app: <folder>/<user_id>/<filename>
-- e.g. receipts/<uid>/...  and  visits/<uid>/...
-- So the user_id is the SECOND path segment.

CREATE POLICY "Photo owners can view their photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'photos'
  AND (
    auth.uid()::text = (storage.foldername(name))[2]
    OR has_role(auth.uid(), 'team_lead'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Users can upload photos to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photos'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

CREATE POLICY "Users can update own photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'photos'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

CREATE POLICY "Users can delete own photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos'
  AND auth.uid()::text = (storage.foldername(name))[2]
);