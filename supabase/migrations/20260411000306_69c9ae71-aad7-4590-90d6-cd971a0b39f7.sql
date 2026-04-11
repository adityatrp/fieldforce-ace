
-- Create teams table
CREATE TABLE public.teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view teams" ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage teams" ON public.teams FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create team_members table
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage team members" ON public.team_members FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Team leads can view team members" ON public.team_members FOR SELECT USING (public.has_role(auth.uid(), 'team_lead'));
CREATE POLICY "Users can view own membership" ON public.team_members FOR SELECT USING (auth.uid() = user_id);
-- Team leads can insert/delete members (for creating salespersons)
CREATE POLICY "Team leads can insert team members" ON public.team_members FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'team_lead'));
CREATE POLICY "Team leads can delete team members" ON public.team_members FOR DELETE USING (public.has_role(auth.uid(), 'team_lead'));

-- Create products table (product master)
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  price NUMERIC NOT NULL DEFAULT 0,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team leads can manage products" ON public.products FOR ALL USING (public.has_role(auth.uid(), 'team_lead'));
CREATE POLICY "Admins can manage products" ON public.products FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create visit_order_items table
CREATE TABLE public.visit_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 1,
  price_at_order NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.visit_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salespersons can insert order items" ON public.visit_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can view order items for their visits" ON public.visit_order_items FOR SELECT TO authenticated USING (true);

-- Allow team leads to delete users (need delete policy on profiles and user_roles for lead-managed users)
CREATE POLICY "Team leads can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'team_lead'));
