ALTER TABLE public.plotting_calendars
  ADD COLUMN IF NOT EXISTS public_access_code_hash TEXT;
