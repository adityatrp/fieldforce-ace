-- Attendance punches: salesperson punches in once at start of day, out at end
CREATE TABLE IF NOT EXISTS public.attendance_punches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  punched_in_at timestamptz NOT NULL DEFAULT now(),
  punched_out_at timestamptz NULL,
  punch_in_latitude double precision NULL,
  punch_in_longitude double precision NULL,
  punch_in_accuracy double precision NULL,
  punch_out_latitude double precision NULL,
  punch_out_longitude double precision NULL,
  punch_out_accuracy double precision NULL,
  battery_percent_in integer NULL,
  battery_percent_out integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_day ON public.attendance_punches(user_id, punched_in_at DESC);

ALTER TABLE public.attendance_punches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own punches"
ON public.attendance_punches FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own punches"
ON public.attendance_punches FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users view own punches"
ON public.attendance_punches FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins view all punches"
ON public.attendance_punches FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Team leads view team punches"
ON public.attendance_punches FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'team_lead'::app_role) AND public.users_share_team(auth.uid(), user_id));

CREATE TRIGGER trg_attendance_updated_at
BEFORE UPDATE ON public.attendance_punches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Location logs: one row per visit check-in (point-to-point distance source)
CREATE TABLE IF NOT EXISTS public.location_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  visit_id uuid NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision NULL,
  battery_percent integer NULL,
  battery_charging boolean NULL,
  source text NOT NULL DEFAULT 'visit_check_in',
  logged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_logs_user_day ON public.location_logs(user_id, logged_at DESC);

ALTER TABLE public.location_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own logs"
ON public.location_logs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own logs"
ON public.location_logs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins view all logs"
ON public.location_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Team leads view team logs"
ON public.location_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'team_lead'::app_role) AND public.users_share_team(auth.uid(), user_id));