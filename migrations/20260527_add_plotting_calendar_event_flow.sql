-- Rebuild event workflow around manual creation and plotting calendars.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.plotting_calendars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  allowed_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_time_slots JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_event_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  max_events_per_date INTEGER,
  max_events_per_slot INTEGER,
  access_type TEXT NOT NULL DEFAULT 'org',
  allowed_user_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  allowed_organization_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  share_token TEXT,
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plotting_calendars_title_min_length CHECK (char_length(trim(title)) >= 3),
  CONSTRAINT plotting_calendars_allowed_dates_is_array CHECK (jsonb_typeof(allowed_dates) = 'array'),
  CONSTRAINT plotting_calendars_allowed_time_slots_is_array CHECK (jsonb_typeof(allowed_time_slots) = 'array'),
  CONSTRAINT plotting_calendars_access_type_check CHECK (access_type IN ('org', 'users', 'organizations', 'share_token')),
  CONSTRAINT plotting_calendars_status_check CHECK (status IN ('active', 'inactive', 'expired', 'archived')),
  CONSTRAINT plotting_calendars_limits_non_negative CHECK (
    (max_events_per_date IS NULL OR max_events_per_date > 0)
    AND (max_events_per_slot IS NULL OR max_events_per_slot > 0)
  )
);

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS creation_method TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS plotting_calendar_id UUID REFERENCES public.plotting_calendars(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hosting_organization TEXT,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Disable the status transition trigger while remapping legacy statuses.
DROP TRIGGER IF EXISTS trg_events_validate_status_transition ON public.events;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_status_check,
  DROP CONSTRAINT IF EXISTS events_creation_method_check,
  DROP CONSTRAINT IF EXISTS events_visibility_check;

UPDATE public.events
SET
  creation_method = COALESCE(NULLIF(creation_method, ''), 'manual'),
  visibility = CASE WHEN is_public = true THEN 'public' ELSE 'internal' END,
  created_by = COALESCE(created_by, requested_by_user_id),
  updated_by = COALESCE(updated_by, requested_by_user_id)
WHERE TRUE;

UPDATE public.events
SET status = CASE
  WHEN status IN ('requested', 'pending', 'rescheduled') THEN 'needs_details'
  WHEN status = 'approved' AND is_public = true AND setup_status = 'complete' THEN 'published'
  WHEN status = 'approved' THEN 'scheduled'
  WHEN status = 'rejected' THEN 'cancelled'
  WHEN status = 'completed' THEN 'completed'
  ELSE COALESCE(status, 'draft')
END
WHERE status IN ('requested', 'pending', 'approved', 'rejected', 'rescheduled', 'completed')
   OR status IS NULL;

ALTER TABLE public.events
  ADD CONSTRAINT events_status_check CHECK (status IN ('draft', 'plotted', 'needs_details', 'scheduled', 'published', 'ongoing', 'completed', 'cancelled')),
  ADD CONSTRAINT events_creation_method_check CHECK (creation_method IN ('manual', 'plotting_calendar')),
  ADD CONSTRAINT events_visibility_check CHECK (visibility IN ('internal', 'public'));

ALTER TABLE public.event_approvals
  DROP CONSTRAINT IF EXISTS event_approvals_from_status_check,
  DROP CONSTRAINT IF EXISTS event_approvals_to_status_check;

CREATE INDEX IF NOT EXISTS plotting_calendars_org_status_idx
  ON public.plotting_calendars (org_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS plotting_calendars_share_token_idx
  ON public.plotting_calendars (share_token)
  WHERE share_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS plotting_calendars_expires_at_idx
  ON public.plotting_calendars (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS plotting_calendars_allowed_dates_gin_idx
  ON public.plotting_calendars USING GIN (allowed_dates);

CREATE INDEX IF NOT EXISTS plotting_calendars_allowed_time_slots_gin_idx
  ON public.plotting_calendars USING GIN (allowed_time_slots);

CREATE INDEX IF NOT EXISTS plotting_calendars_allowed_event_types_gin_idx
  ON public.plotting_calendars USING GIN (allowed_event_types);

CREATE INDEX IF NOT EXISTS events_visibility_status_date_idx
  ON public.events (visibility, status, event_date);

CREATE INDEX IF NOT EXISTS events_org_creation_method_date_idx
  ON public.events (org_id, creation_method, event_date);

CREATE INDEX IF NOT EXISTS events_plotting_calendar_id_idx
  ON public.events (plotting_calendar_id)
  WHERE plotting_calendar_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_event_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft' AND NEW.status IN ('draft', 'needs_details', 'scheduled', 'published', 'cancelled'))
      OR (OLD.status = 'plotted' AND NEW.status IN ('plotted', 'needs_details', 'scheduled', 'published', 'cancelled'))
      OR (OLD.status = 'needs_details' AND NEW.status IN ('needs_details', 'scheduled', 'published', 'cancelled'))
      OR (OLD.status = 'scheduled' AND NEW.status IN ('scheduled', 'needs_details', 'published', 'ongoing', 'completed', 'cancelled'))
      OR (OLD.status = 'published' AND NEW.status IN ('published', 'scheduled', 'ongoing', 'completed', 'cancelled'))
      OR (OLD.status = 'ongoing' AND NEW.status IN ('ongoing', 'completed', 'cancelled'))
      OR (OLD.status = 'completed' AND NEW.status = 'completed')
      OR (OLD.status = 'cancelled' AND NEW.status = 'cancelled')
    ) THEN
      RAISE EXCEPTION 'Invalid event status transition: % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.status = 'published' AND OLD.approved_at IS NULL THEN
      NEW.approved_at = NOW();
    ELSIF NEW.status = 'cancelled' AND OLD.rejected_at IS NULL THEN
      NEW.rejected_at = NOW();
    ELSIF NEW.status = 'completed' AND OLD.completed_at IS NULL THEN
      NEW.completed_at = NOW();
    END IF;
  END IF;

  IF NEW.visibility = 'public' THEN
    NEW.is_public = TRUE;
  ELSIF NEW.is_public = FALSE THEN
    NEW.visibility = 'internal';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_validate_status_transition ON public.events;
CREATE TRIGGER trg_events_validate_status_transition
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.validate_event_status_transition();
