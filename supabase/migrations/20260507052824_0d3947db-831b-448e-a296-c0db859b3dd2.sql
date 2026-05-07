-- SECURITY DEFINER function: lets an assigned salesperson set a shop's
-- coordinates exactly once (only if currently NULL). After the first save,
-- the coordinates become the verified target for that shop.
CREATE OR REPLACE FUNCTION public.set_shop_coords_if_unset(
  _shop_id uuid,
  _lat double precision,
  _lng double precision
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _allowed boolean;
  _updated int;
BEGIN
  -- Only the assigned salesperson (or team lead / admin) can set coords
  SELECT
    public.user_has_active_shop_assignment(auth.uid(), _shop_id)
    OR public.user_is_team_lead_for_shop(auth.uid(), _shop_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  INTO _allowed;

  IF NOT _allowed THEN
    RETURN false;
  END IF;

  UPDATE public.shops
     SET latitude = _lat,
         longitude = _lng,
         geocode_status = 'ok',
         geocode_error = '',
         updated_at = now()
   WHERE id = _shop_id
     AND latitude IS NULL
     AND longitude IS NULL;

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated > 0;
END;
$$;

-- Enable realtime on the key tables for live dashboards
ALTER TABLE public.visits REPLICA IDENTITY FULL;
ALTER TABLE public.shops REPLICA IDENTITY FULL;
ALTER TABLE public.shop_assignments REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.visits;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shops;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_assignments;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
