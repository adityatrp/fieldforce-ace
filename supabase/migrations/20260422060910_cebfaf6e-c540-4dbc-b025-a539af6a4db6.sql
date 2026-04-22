
-- Add visit due date and reassignment tracking
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS due_date timestamp with time zone;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS reassigned_to_visit_id uuid;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS auto_failed boolean NOT NULL DEFAULT false;

-- Extend products with more detail
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku text NOT NULL DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

-- Marketing materials catalog (returnable items)
CREATE TABLE IF NOT EXISTS public.marketing_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'pcs',
  team_id uuid NOT NULL,
  created_by uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view marketing materials"
  ON public.marketing_materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leads and admins manage marketing materials"
  ON public.marketing_materials FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'team_lead'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'team_lead'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_marketing_materials_updated
  BEFORE UPDATE ON public.marketing_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Issuance ledger for marketing materials
CREATE TABLE IF NOT EXISTS public.marketing_issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL,
  issued_to uuid NOT NULL,
  issued_by uuid NOT NULL,
  team_id uuid NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'issued',
  issued_at timestamp with time zone NOT NULL DEFAULT now(),
  returned_at timestamp with time zone,
  returned_quantity numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_issuances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salesperson sees own issuances"
  ON public.marketing_issuances FOR SELECT TO authenticated
  USING (auth.uid() = issued_to);
CREATE POLICY "Leads and admins view all issuances"
  ON public.marketing_issuances FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'team_lead'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Leads and admins manage issuances"
  ON public.marketing_issuances FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'team_lead'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'team_lead'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_marketing_issuances_updated
  BEFORE UPDATE ON public.marketing_issuances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
