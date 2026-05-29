-- events/schema.sql
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
    access_type TEXT NOT NULL DEFAULT 'organization_link',
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
    CONSTRAINT plotting_calendars_access_type_check CHECK (access_type IN ('org', 'users', 'organizations', 'share_token', 'organization_link')),
    CONSTRAINT plotting_calendars_status_check CHECK (status IN ('active', 'closed', 'expired', 'archived')),
    CONSTRAINT plotting_calendars_limits_non_negative CHECK (
        (max_events_per_date IS NULL OR max_events_per_date > 0)
        AND (max_events_per_slot IS NULL OR max_events_per_slot > 0)
    )
);

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

DROP TRIGGER IF EXISTS trg_plotting_calendars_set_updated_at ON public.plotting_calendars;
CREATE TRIGGER trg_plotting_calendars_set_updated_at
BEFORE UPDATE ON public.plotting_calendars
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.plotting_calendar_days (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plotting_calendar_id UUID NOT NULL REFERENCES public.plotting_calendars(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    availability_mode TEXT NOT NULL DEFAULT 'slots',
    flexible_starts_at TIME,
    flexible_ends_at TIME,
    max_events_for_day INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT plotting_calendar_days_unique_date UNIQUE (plotting_calendar_id, date),
    CONSTRAINT plotting_calendar_days_status_check CHECK (status IN ('open', 'unavailable', 'fully_booked')),
    CONSTRAINT plotting_calendar_days_mode_check CHECK (availability_mode IN ('flexible', 'slots')),
    CONSTRAINT plotting_calendar_days_flexible_window_check CHECK (
        flexible_starts_at IS NULL
        OR flexible_ends_at IS NULL
        OR flexible_ends_at > flexible_starts_at
    ),
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

CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    address TEXT,
    type TEXT NOT NULL,
    event_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    description TEXT,
    image_url TEXT,
    extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft',
    setup_status TEXT NOT NULL DEFAULT 'needs_details',
    setup_completed_at TIMESTAMPTZ,
    creation_method TEXT NOT NULL DEFAULT 'manual',
    plotting_calendar_id UUID REFERENCES public.plotting_calendars(id) ON DELETE SET NULL,
    hosting_organization TEXT,
    visibility TEXT NOT NULL DEFAULT 'internal',
    requested_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rescheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    actual_collected_bags INTEGER,
    actual_donors INTEGER,
    wastage_units INTEGER,
    post_event_notes TEXT,
    post_event_attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT events_type_check CHECK (type IN ('blood_drive', 'training', 'advocacy', 'assembly')),
    CONSTRAINT events_status_check CHECK (status IN ('draft', 'plotted', 'needs_details', 'scheduled', 'published', 'ongoing', 'completed', 'cancelled')),
    CONSTRAINT events_setup_status_check CHECK (setup_status IN ('needs_details', 'pending_setup', 'complete')),
    CONSTRAINT events_creation_method_check CHECK (creation_method IN ('manual', 'plotting_calendar')),
    CONSTRAINT events_visibility_check CHECK (visibility IN ('internal', 'public')),
    CONSTRAINT events_time_window_check CHECK (
        start_time IS NULL
        OR end_time IS NULL
        OR end_time > start_time
    ),
    CONSTRAINT events_title_min_length CHECK (char_length(trim(title)) >= 3),
    CONSTRAINT events_extra_data_is_object CHECK (jsonb_typeof(extra_data) = 'object'),
    CONSTRAINT events_extra_data_shape_check CHECK (
        (type <> 'blood_drive')
        OR (
            type = 'blood_drive'
            AND (
                NOT (extra_data ? 'target_donation')
                OR jsonb_typeof(extra_data -> 'target_donation') = 'number'
            )
            AND (
                NOT (extra_data ? 'collected_blood')
                OR jsonb_typeof(extra_data -> 'collected_blood') = 'number'
            )
        )
    ),
    CONSTRAINT events_blood_drive_numbers_non_negative CHECK (
        type <> 'blood_drive'
        OR (
            (
                NOT (extra_data ? 'target_donation')
                OR (extra_data ->> 'target_donation')::numeric >= 0
            )
            AND (
                NOT (extra_data ? 'collected_blood')
                OR (extra_data ->> 'collected_blood')::numeric >= 0
            )
        )
    ),
    CONSTRAINT events_post_event_attachments_is_array CHECK (jsonb_typeof(post_event_attachments) = 'array'),
    CONSTRAINT events_post_event_metrics_non_negative CHECK (
        (actual_collected_bags IS NULL OR actual_collected_bags >= 0)
        AND (actual_donors IS NULL OR actual_donors >= 0)
        AND (wastage_units IS NULL OR wastage_units >= 0)
    )
);

CREATE INDEX IF NOT EXISTS events_org_id_idx
    ON public.events (org_id);

CREATE INDEX IF NOT EXISTS events_org_status_date_idx
    ON public.events (org_id, status, event_date);

CREATE INDEX IF NOT EXISTS events_org_setup_status_date_idx
    ON public.events (org_id, setup_status, event_date);

CREATE INDEX IF NOT EXISTS events_is_public_date_idx
    ON public.events (is_public, event_date) WHERE is_public = true;

CREATE INDEX IF NOT EXISTS events_visibility_status_date_idx
    ON public.events (visibility, status, event_date);

CREATE INDEX IF NOT EXISTS events_org_creation_method_date_idx
    ON public.events (org_id, creation_method, event_date);

CREATE INDEX IF NOT EXISTS events_org_event_type_date_idx
    ON public.events (org_id, type, event_date);

CREATE INDEX IF NOT EXISTS events_requested_by_user_id_idx
    ON public.events (requested_by_user_id);

CREATE INDEX IF NOT EXISTS events_plotting_calendar_id_idx
    ON public.events (plotting_calendar_id)
    WHERE plotting_calendar_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS events_extra_data_gin_idx
    ON public.events USING GIN (extra_data);

DROP TRIGGER IF EXISTS trg_events_set_updated_at ON public.events;
CREATE TRIGGER trg_events_set_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

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

CREATE TABLE IF NOT EXISTS public.event_staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    assignment_role TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT event_staff_assignment_role_check CHECK (assignment_role IN ('lead', 'coordinator', 'staff', 'volunteer')),
    CONSTRAINT event_staff_unique_assignment UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_staff_org_id_idx
    ON public.event_staff (org_id);

CREATE INDEX IF NOT EXISTS event_staff_event_id_idx
    ON public.event_staff (event_id);

CREATE INDEX IF NOT EXISTS event_staff_user_id_idx
    ON public.event_staff (user_id);

CREATE INDEX IF NOT EXISTS event_staff_role_idx
    ON public.event_staff (assignment_role);

DROP TRIGGER IF EXISTS trg_event_staff_set_updated_at ON public.event_staff;
CREATE TRIGGER trg_event_staff_set_updated_at
BEFORE UPDATE ON public.event_staff
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.event_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    participant_type TEXT NOT NULL,
    participant_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    participant_donor_id UUID,
    status TEXT NOT NULL DEFAULT 'applied',
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    participated_at TIMESTAMPTZ,
    donated_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT event_participants_type_check CHECK (participant_type IN ('user', 'donor')),
    CONSTRAINT event_participants_status_check CHECK (status IN ('applied', 'confirmed', 'participated', 'donated', 'no_show')),
    CONSTRAINT event_participants_identity_check CHECK (
        (participant_type = 'user' AND participant_user_id IS NOT NULL AND participant_donor_id IS NULL)
        OR (participant_type = 'donor' AND participant_donor_id IS NOT NULL AND participant_user_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS event_participants_unique_event_participant_idx
    ON public.event_participants (event_id, participant_type, COALESCE(participant_user_id, participant_donor_id));

CREATE INDEX IF NOT EXISTS event_participants_org_id_idx
    ON public.event_participants (org_id);

CREATE INDEX IF NOT EXISTS event_participants_event_id_idx
    ON public.event_participants (event_id);

CREATE INDEX IF NOT EXISTS event_participants_status_idx
    ON public.event_participants (org_id, status);

CREATE INDEX IF NOT EXISTS event_participants_user_id_idx
    ON public.event_participants (participant_user_id)
    WHERE participant_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_participants_donor_id_idx
    ON public.event_participants (participant_donor_id)
    WHERE participant_donor_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_event_participants_set_updated_at ON public.event_participants;
CREATE TRIGGER trg_event_participants_set_updated_at
BEFORE UPDATE ON public.event_participants
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.event_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    acted_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    approval_level TEXT,
    geo_scope JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT event_approvals_action_check CHECK (action IN ('request', 'accept', 'reject', 'reschedule', 'auto_approve')),
    CONSTRAINT event_approvals_geo_scope_is_object_or_null CHECK (
        geo_scope IS NULL OR jsonb_typeof(geo_scope) = 'object'
    )
);

ALTER TABLE public.event_approvals
    DROP COLUMN IF EXISTS org_type_scope;

CREATE INDEX IF NOT EXISTS event_approvals_org_id_idx
    ON public.event_approvals (org_id);

CREATE INDEX IF NOT EXISTS event_approvals_event_id_idx
    ON public.event_approvals (event_id);

CREATE INDEX IF NOT EXISTS event_approvals_event_created_at_idx
    ON public.event_approvals (event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS event_approvals_action_idx
    ON public.event_approvals (action);

CREATE INDEX IF NOT EXISTS event_approvals_actor_idx
    ON public.event_approvals (acted_by_user_id);

CREATE INDEX IF NOT EXISTS event_approvals_geo_scope_gin_idx
    ON public.event_approvals USING GIN (geo_scope);

DROP TRIGGER IF EXISTS trg_event_approvals_set_updated_at ON public.event_approvals;
CREATE TRIGGER trg_event_approvals_set_updated_at
BEFORE UPDATE ON public.event_approvals
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
