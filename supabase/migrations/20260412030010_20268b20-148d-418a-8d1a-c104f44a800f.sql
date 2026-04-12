
-- Add approved_by column to expenses
ALTER TABLE public.expenses ADD COLUMN approved_by uuid DEFAULT NULL;
