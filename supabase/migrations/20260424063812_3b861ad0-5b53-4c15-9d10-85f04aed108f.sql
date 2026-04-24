-- Daily summary of tracking for each salesperson
CREATE TABLE public.attendance_daily_summary (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  work_date date NOT NULL,
  total_distance_km numeric NOT NULL DEFAULT 0,
  total_idle_minutes integer NOT NULL DEFAULT 0,
  total_active_visit_minutes integer NOT NULL DEFAULT 0,
  punched_in_at timestamptz,
  punched_out_at timestamptz,
  ping_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, work_date)
);

CREATE INDEX idx_attendance_daily_summary_user_date
  ON public.attendance_daily_summary (user_id, work_date DESC);

ALTER TABLE public.attendance_daily_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own summary"
  ON public.attendance_daily_summary
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own summary"
  ON public.attendance_daily_summary
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own summary"
  ON public.attendance_daily_summary
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Team leads view team summary"
  ON public.attendance_daily_summary
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'team_lead'::app_role)
    AND users_share_team(auth.uid(), user_id)
  );

CREATE POLICY "Admins view all summaries"
  ON public.attendance_daily_summary
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_attendance_daily_summary_updated_at
BEFORE UPDATE ON public.attendance_daily_summary
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();