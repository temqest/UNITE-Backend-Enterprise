ALTER TABLE public.plotting_calendars
  ALTER COLUMN access_type SET DEFAULT 'organization_link';

ALTER TABLE public.plotting_calendars
  DROP CONSTRAINT IF EXISTS plotting_calendars_access_type_check;

ALTER TABLE public.plotting_calendars
  ADD CONSTRAINT plotting_calendars_access_type_check
  CHECK (access_type IN ('org', 'users', 'organizations', 'share_token', 'organization_link'));