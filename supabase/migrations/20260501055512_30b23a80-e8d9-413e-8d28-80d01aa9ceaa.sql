
DELETE FROM public.visit_order_items;
DELETE FROM public.visit_extra_photos;
DELETE FROM public.visits;

CREATE TABLE public.shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  contact_person TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  geocode_status TEXT NOT NULL DEFAULT 'pending',
  geocode_error TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shops_team ON public.shops(team_id);
CREATE UNIQUE INDEX uniq_shops_team_name ON public.shops(team_id, lower(name));
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_shops_updated_at BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.shop_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL,
  assigned_to UUID NOT NULL,
  visits_per_month SMALLINT NOT NULL CHECK (visits_per_month BETWEEN 1 AND 5),
  assigned_by UUID NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_shop_assignment_active ON public.shop_assignments(shop_id) WHERE active;
CREATE INDEX idx_shop_assignments_user ON public.shop_assignments(assigned_to);
ALTER TABLE public.shop_assignments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_shop_assignments_updated_at BEFORE UPDATE ON public.shop_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admins manage all shops" ON public.shops
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Team leads manage own team shops" ON public.shops
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'team_lead'::app_role)
         AND EXISTS (SELECT 1 FROM public.team_members tm
                     WHERE tm.team_id = shops.team_id AND tm.user_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'team_lead'::app_role)
         AND EXISTS (SELECT 1 FROM public.team_members tm
                     WHERE tm.team_id = shops.team_id AND tm.user_id = auth.uid()));
CREATE POLICY "Salespersons view shops assigned to them" ON public.shops
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shop_assignments sa
                 WHERE sa.shop_id = shops.id AND sa.assigned_to = auth.uid() AND sa.active));

CREATE POLICY "Admins manage assignments" ON public.shop_assignments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Team leads manage assignments for team shops" ON public.shop_assignments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'team_lead'::app_role)
         AND EXISTS (SELECT 1 FROM public.shops s
                     JOIN public.team_members tm ON tm.team_id = s.team_id
                     WHERE s.id = shop_assignments.shop_id AND tm.user_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'team_lead'::app_role)
         AND EXISTS (SELECT 1 FROM public.shops s
                     JOIN public.team_members tm ON tm.team_id = s.team_id
                     WHERE s.id = shop_assignments.shop_id AND tm.user_id = auth.uid()));
CREATE POLICY "Salespersons view own assignments" ON public.shop_assignments
  FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());

ALTER TABLE public.visits
  ADD COLUMN shop_id UUID,
  ADD COLUMN assignment_id UUID,
  ADD COLUMN period_index SMALLINT,
  ADD COLUMN period_start DATE,
  ADD COLUMN period_end DATE;

CREATE INDEX idx_visits_shop ON public.visits(shop_id);
CREATE INDEX idx_visits_period ON public.visits(assignment_id, period_start);
