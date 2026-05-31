ALTER TABLE public.plotting_calendar_days
ADD COLUMN IF NOT EXISTS availability_mode TEXT NOT NULL DEFAULT 'slots';

ALTER TABLE public.plotting_calendar_days
ADD COLUMN IF NOT EXISTS flexible_starts_at TIME;

ALTER TABLE public.plotting_calendar_days
ADD COLUMN IF NOT EXISTS flexible_ends_at TIME;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plotting_calendar_days_mode_check'
  ) THEN
    ALTER TABLE public.plotting_calendar_days
    ADD CONSTRAINT plotting_calendar_days_mode_check
    CHECK (availability_mode IN ('flexible', 'slots'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plotting_calendar_days_flexible_window_check'
  ) THEN
    ALTER TABLE public.plotting_calendar_days
    ADD CONSTRAINT plotting_calendar_days_flexible_window_check
    CHECK (
      flexible_starts_at IS NULL
      OR flexible_ends_at IS NULL
      OR flexible_ends_at > flexible_starts_at
    );
  END IF;
END $$;

UPDATE public.plotting_calendar_days day
SET
  availability_mode = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.plotting_calendar_time_slots slot
      WHERE slot.plotting_calendar_day_id = day.id
    ) THEN 'slots'
    ELSE 'flexible'
  END,
  flexible_starts_at = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.plotting_calendar_time_slots slot
      WHERE slot.plotting_calendar_day_id = day.id
    ) THEN NULL
    ELSE COALESCE(day.flexible_starts_at, TIME '08:00')
  END,
  flexible_ends_at = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.plotting_calendar_time_slots slot
      WHERE slot.plotting_calendar_day_id = day.id
    ) THEN NULL
    ELSE COALESCE(day.flexible_ends_at, TIME '17:00')
  END;
