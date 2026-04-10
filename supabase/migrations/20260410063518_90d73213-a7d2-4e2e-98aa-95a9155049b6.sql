
-- Add new columns to visits table
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS assigned_by UUID;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS target_latitude DOUBLE PRECISION;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS target_longitude DOUBLE PRECISION;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS visit_status TEXT NOT NULL DEFAULT 'assigned';
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS order_received BOOLEAN DEFAULT false;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS order_notes TEXT DEFAULT '';
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS location_name TEXT DEFAULT '';

-- Drop old RLS policies
DROP POLICY IF EXISTS "Users can create own visits" ON public.visits;
DROP POLICY IF EXISTS "Users can update own visits" ON public.visits;
DROP POLICY IF EXISTS "Users can view own visits" ON public.visits;
DROP POLICY IF EXISTS "Leads and admins can view all visits" ON public.visits;

-- Team leads and admins can create visits (assign)
CREATE POLICY "Leads and admins can create visits"
ON public.visits FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'team_lead') OR has_role(auth.uid(), 'admin')
);

-- Salespersons can view visits assigned to them
CREATE POLICY "Salespersons can view assigned visits"
ON public.visits FOR SELECT
USING (auth.uid() = assigned_to);

-- Team leads and admins can view all visits
CREATE POLICY "Leads and admins can view all visits"
ON public.visits FOR SELECT
USING (has_role(auth.uid(), 'team_lead') OR has_role(auth.uid(), 'admin'));

-- Salespersons can update visits assigned to them (check-in/check-out)
CREATE POLICY "Salespersons can update assigned visits"
ON public.visits FOR UPDATE
USING (auth.uid() = assigned_to);

-- Admins can update any visit
CREATE POLICY "Admins can update any visit"
ON public.visits FOR UPDATE
USING (has_role(auth.uid(), 'admin'));
