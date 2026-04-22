
-- Table to store optional additional photos (with captions) attached during salesperson check-in.
CREATE TABLE public.visit_extra_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id uuid NOT NULL,
  photo_path text NOT NULL,
  caption text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.visit_extra_photos ENABLE ROW LEVEL SECURITY;

-- Salesperson can insert extra photos for their assigned visits
CREATE POLICY "Salespersons insert extra photos for their visits"
ON public.visit_extra_photos FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.visits v
  WHERE v.id = visit_extra_photos.visit_id AND v.assigned_to = auth.uid()
));

-- Salesperson can view extra photos for their assigned visits
CREATE POLICY "Salespersons view extra photos for their visits"
ON public.visit_extra_photos FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.visits v
  WHERE v.id = visit_extra_photos.visit_id AND v.assigned_to = auth.uid()
));

-- Team leads and admins can view all extra photos
CREATE POLICY "Leads and admins view all extra photos"
ON public.visit_extra_photos FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'team_lead'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_visit_extra_photos_visit_id ON public.visit_extra_photos(visit_id);
