ALTER TABLE public.plotting_calendars
  ALTER COLUMN access_type SET DEFAULT 'organization_link';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plotting_calendars_access_type_check'
  ) THEN
    ALTER TABLE public.plotting_calendars
      DROP CONSTRAINT plotting_calendars_access_type_check;
  END IF;
END $$;

ALTER TABLE public.plotting_calendars
  ADD CONSTRAINT plotting_calendars_access_type_check
  CHECK (access_type IN ('org', 'users', 'organizations', 'share_token', 'organization_link'));