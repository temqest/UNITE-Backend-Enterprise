-- Rebuild event workflow around manual creation and plotting calendars.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

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
  CONSTRAINT plotting_calendars_status_check CHECK (status IN ('active', 'closed', 'expired', 'archived')),
  CONSTRAINT plotting_calendars_limits_non_negative CHECK (
    (max_events_per_date IS NULL OR max_events_per_date > 0)
    AND (max_events_per_slot IS NULL OR max_events_per_slot > 0)
  )
);

ALTER TABLE public.plotting_calendars
  DROP CONSTRAINT IF EXISTS plotting_calendars_status_check;

UPDATE public.plotting_calendars
SET status = 'closed'
WHERE status = 'inactive';

ALTER TABLE public.plotting_calendars
  ADD CONSTRAINT plotting_calendars_status_check CHECK (status IN ('active', 'closed', 'expired', 'archived'));

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

CREATE TABLE IF NOT EXISTS public.plotting_calendar_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plotting_calendar_id UUID NOT NULL REFERENCES public.plotting_calendars(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  max_events_for_day INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plotting_calendar_days_unique_date UNIQUE (plotting_calendar_id, date),
  CONSTRAINT plotting_calendar_days_status_check CHECK (status IN ('open', 'unavailable', 'fully_booked')),
  CONSTRAINT plotting_calendar_days_capacity_positive CHECK (max_events_for_day IS NULL OR max_events_for_day > 0)
);

CREATE INDEX IF NOT EXISTS plotting_calendar_days_calendar_date_idx
  ON public.plotting_calendar_days (plotting_calendar_id, date);

CREATE INDEX IF NOT EXISTS plotting_calendar_days_status_idx
  ON public.plotting_calendar_days (plotting_calendar_id, status, date);

DROP TRIGGER IF EXISTS trg_plotting_calendar_days_set_updated_at ON public.plotting_calendar_days;
CREATE TRIGGER trg_plotting_calendar_days_set_updated_at
BEFORE UPDATE ON public.plotting_calendar_days
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.plotting_calendar_time_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plotting_calendar_day_id UUID NOT NULL REFERENCES public.plotting_calendar_days(id) ON DELETE CASCADE,
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  max_events_for_slot INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plotting_calendar_time_slots_unique_window UNIQUE (plotting_calendar_day_id, starts_at, ends_at),
  CONSTRAINT plotting_calendar_time_slots_status_check CHECK (status IN ('open', 'unavailable', 'fully_booked')),
  CONSTRAINT plotting_calendar_time_slots_capacity_positive CHECK (max_events_for_slot IS NULL OR max_events_for_slot > 0),
  CONSTRAINT plotting_calendar_time_slots_window_check CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS plotting_calendar_time_slots_day_status_idx
  ON public.plotting_calendar_time_slots (plotting_calendar_day_id, status, starts_at);

DROP TRIGGER IF EXISTS trg_plotting_calendar_time_slots_set_updated_at ON public.plotting_calendar_time_slots;
CREATE TRIGGER trg_plotting_calendar_time_slots_set_updated_at
BEFORE UPDATE ON public.plotting_calendar_time_slots
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.plotting_calendar_days (
  plotting_calendar_id,
  date,
  status,
  max_events_for_day
)
SELECT
  pc.id,
  allowed_date.value::date,
  'open',
  pc.max_events_per_date
FROM public.plotting_calendars pc
CROSS JOIN LATERAL jsonb_array_elements_text(pc.allowed_dates) AS allowed_date(value)
ON CONFLICT (plotting_calendar_id, date) DO NOTHING;

INSERT INTO public.plotting_calendar_time_slots (
  plotting_calendar_day_id,
  starts_at,
  ends_at,
  label,
  status,
  max_events_for_slot
)
SELECT
  pcd.id,
  (slot.value ->> 'start_time')::time,
  (slot.value ->> 'end_time')::time,
  NULLIF(slot.value ->> 'label', ''),
  'open',
  pc.max_events_per_slot
FROM public.plotting_calendar_days pcd
JOIN public.plotting_calendars pc ON pc.id = pcd.plotting_calendar_id
CROSS JOIN LATERAL jsonb_array_elements(pc.allowed_time_slots) AS slot(value)
WHERE slot.value ? 'start_time'
  AND slot.value ? 'end_time'
ON CONFLICT (plotting_calendar_day_id, starts_at, ends_at) DO NOTHING;

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

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.org_id
  FROM public.users AS u
  WHERE u.auth_id = auth.uid()
    AND u.is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users AS u
  WHERE u.auth_id = auth.uid()
    AND u.is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role_type()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.role ->> 'type'
  FROM public.users AS u
  WHERE u.auth_id = auth.uid()
    AND u.is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_permission(required_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users AS u
    WHERE u.auth_id = auth.uid()
      AND u.is_active = true
      AND (
        u.role ->> 'type' = 'super_admin'
        OR (u.role -> 'permissions') ? required_permission
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_any_permission(required_permissions TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users AS u
    WHERE u.auth_id = auth.uid()
      AND u.is_active = true
      AND (
        u.role ->> 'type' = 'super_admin'
        OR EXISTS (
          SELECT 1
          FROM unnest(required_permissions) AS permission_name
          WHERE (u.role -> 'permissions') ? permission_name
        )
      )
  );
$$;

DROP POLICY IF EXISTS events_select_same_org ON public.events;
CREATE POLICY events_select_same_org
ON public.events
FOR SELECT
USING (
  org_id = public.current_user_org_id()
  OR (status = 'published' AND setup_status = 'complete' AND (visibility = 'public' OR is_public = true))
);

ALTER TABLE public.plotting_calendar_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plotting_calendar_time_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plotting_calendar_days_select_accessible ON public.plotting_calendar_days;
CREATE POLICY plotting_calendar_days_select_accessible
ON public.plotting_calendar_days
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.plotting_calendars calendar
    WHERE calendar.id = plotting_calendar_days.plotting_calendar_id
      AND calendar.org_id = public.current_user_org_id()
      AND (
        public.current_user_has_any_permission(ARRAY['events.read', 'view_events'])
        OR public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
      )
      AND (
        calendar.access_type = 'org'
        OR public.current_user_profile_id() = ANY(calendar.allowed_user_ids)
        OR public.current_user_org_id() = ANY(calendar.allowed_organization_ids)
        OR public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
      )
  )
);

DROP POLICY IF EXISTS plotting_calendar_days_manage ON public.plotting_calendar_days;
CREATE POLICY plotting_calendar_days_manage
ON public.plotting_calendar_days
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.plotting_calendars calendar
    WHERE calendar.id = plotting_calendar_days.plotting_calendar_id
      AND calendar.org_id = public.current_user_org_id()
      AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR (
          public.current_user_has_any_permission(ARRAY['events.create', 'create_events'])
          AND public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events'])
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.plotting_calendars calendar
    WHERE calendar.id = plotting_calendar_days.plotting_calendar_id
      AND calendar.org_id = public.current_user_org_id()
      AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR (
          public.current_user_has_any_permission(ARRAY['events.create', 'create_events'])
          AND public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events'])
        )
      )
  )
);

DROP POLICY IF EXISTS plotting_calendar_time_slots_select_accessible ON public.plotting_calendar_time_slots;
CREATE POLICY plotting_calendar_time_slots_select_accessible
ON public.plotting_calendar_time_slots
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.plotting_calendar_days day
    JOIN public.plotting_calendars calendar ON calendar.id = day.plotting_calendar_id
    WHERE day.id = plotting_calendar_time_slots.plotting_calendar_day_id
      AND calendar.org_id = public.current_user_org_id()
      AND (
        public.current_user_has_any_permission(ARRAY['events.read', 'view_events'])
        OR public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
      )
      AND (
        calendar.access_type = 'org'
        OR public.current_user_profile_id() = ANY(calendar.allowed_user_ids)
        OR public.current_user_org_id() = ANY(calendar.allowed_organization_ids)
        OR public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
      )
  )
);

DROP POLICY IF EXISTS plotting_calendar_time_slots_manage ON public.plotting_calendar_time_slots;
CREATE POLICY plotting_calendar_time_slots_manage
ON public.plotting_calendar_time_slots
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.plotting_calendar_days day
    JOIN public.plotting_calendars calendar ON calendar.id = day.plotting_calendar_id
    WHERE day.id = plotting_calendar_time_slots.plotting_calendar_day_id
      AND calendar.org_id = public.current_user_org_id()
      AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR (
          public.current_user_has_any_permission(ARRAY['events.create', 'create_events'])
          AND public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events'])
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.plotting_calendar_days day
    JOIN public.plotting_calendars calendar ON calendar.id = day.plotting_calendar_id
    WHERE day.id = plotting_calendar_time_slots.plotting_calendar_day_id
      AND calendar.org_id = public.current_user_org_id()
      AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR (
          public.current_user_has_any_permission(ARRAY['events.create', 'create_events'])
          AND public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events'])
        )
      )
  )
);
