-- 1) Order approval workflow on visits
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS order_approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS order_approved_by uuid,
  ADD COLUMN IF NOT EXISTS order_approved_at timestamptz;

-- 2) Targets: optional period start so weekly/daily windows are unique
ALTER TABLE public.targets
  ADD COLUMN IF NOT EXISTS period_start date;

-- 3) Dedupe existing targets (now period_start exists)
DELETE FROM public.targets t
USING public.targets t2
WHERE t.user_id = t2.user_id
  AND t.period = t2.period
  AND COALESCE(t.period_start, DATE '1900-01-01') = COALESCE(t2.period_start, DATE '1900-01-01')
  AND (t.updated_at < t2.updated_at
       OR (t.updated_at = t2.updated_at AND t.id < t2.id));

-- 4) Uniqueness for one target per (user, period, window)
CREATE UNIQUE INDEX IF NOT EXISTS targets_user_period_start_unique
  ON public.targets (user_id, period, COALESCE(period_start, DATE '1900-01-01'));