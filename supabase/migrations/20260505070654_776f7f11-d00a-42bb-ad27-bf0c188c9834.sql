-- Track out-of-radius check-in attempts so Team Leads can be notified.
CREATE TABLE public.failed_check_in_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  shop_id uuid,
  assignment_id uuid,
  shop_name text NOT NULL DEFAULT '',
  target_latitude double precision,
  target_longitude double precision,
  attempt_latitude double precision NOT NULL,
  attempt_longitude double precision NOT NULL,
  distance_meters integer NOT NULL,
  attempt_accuracy double precision,
  attempted_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_failed_attempts_user ON public.failed_check_in_attempts(user_id);
CREATE INDEX idx_failed_attempts_shop ON public.failed_check_in_attempts(shop_id);
CREATE INDEX idx_failed_attempts_attempted_at ON public.failed_check_in_attempts(attempted_at DESC);

ALTER TABLE public.failed_check_in_attempts ENABLE ROW LEVEL SECURITY;

-- Salesperson can insert their own attempts and view their own.
CREATE POLICY "Users insert own failed attempts"
  ON public.failed_check_in_attempts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own failed attempts"
  ON public.failed_check_in_attempts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Team leads see attempts by anyone in their team.
CREATE POLICY "Team leads view team failed attempts"
  ON public.failed_check_in_attempts FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'team_lead'::app_role) AND users_share_team(auth.uid(), user_id));

-- Admins see all.
CREATE POLICY "Admins view all failed attempts"
  ON public.failed_check_in_attempts FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Realtime support
ALTER PUBLICATION supabase_realtime ADD TABLE public.failed_check_in_attempts;