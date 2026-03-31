-- events/schema.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Shared updated_at trigger helper.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    address TEXT NOT NULL,
    type TEXT NOT NULL,
    event_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    description TEXT,
    image_url TEXT,
    extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'requested',
    requested_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rescheduled_at TIMESTAMPTZ,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT events_type_check CHECK (type IN ('blood_drive', 'training', 'advocacy')),
    CONSTRAINT events_status_check CHECK (status IN ('requested', 'pending', 'approved', 'rejected', 'rescheduled')),
    CONSTRAINT events_time_window_check CHECK (end_time > start_time),
    CONSTRAINT events_title_min_length CHECK (char_length(trim(title)) >= 3),
    CONSTRAINT events_extra_data_is_object CHECK (jsonb_typeof(extra_data) = 'object'),
    CONSTRAINT events_extra_data_shape_check CHECK (
        (type = 'blood_drive'
            AND extra_data ? 'target_donation'
            AND jsonb_typeof(extra_data -> 'target_donation') = 'number'
            AND (
                NOT (extra_data ? 'collected_blood')
                OR jsonb_typeof(extra_data -> 'collected_blood') = 'number'
            )
        )
        OR (type = 'training'
            AND extra_data ? 'training_type'
            AND jsonb_typeof(extra_data -> 'training_type') = 'string'
        )
        OR (type = 'advocacy'
            AND extra_data ? 'topic'
            AND jsonb_typeof(extra_data -> 'topic') = 'string'
        )
    ),
    CONSTRAINT events_blood_drive_numbers_non_negative CHECK (
        type <> 'blood_drive'
        OR (
            (extra_data ->> 'target_donation')::numeric >= 0
            AND (
                NOT (extra_data ? 'collected_blood')
                OR (extra_data ->> 'collected_blood')::numeric >= 0
            )
        )
    )
);

-- Add is_public column if it doesn't exist (for migrations from older schema)
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS events_org_id_idx
    ON public.events (org_id);

CREATE INDEX IF NOT EXISTS events_org_status_date_idx
    ON public.events (org_id, status, event_date);

CREATE INDEX IF NOT EXISTS events_is_public_date_idx
    ON public.events (is_public, event_date) WHERE is_public = true;

CREATE INDEX IF NOT EXISTS events_org_event_type_date_idx
    ON public.events (org_id, type, event_date);

CREATE INDEX IF NOT EXISTS events_requested_by_user_id_idx
    ON public.events (requested_by_user_id);

CREATE INDEX IF NOT EXISTS events_extra_data_gin_idx
    ON public.events USING GIN (extra_data);

DROP TRIGGER IF EXISTS trg_events_set_updated_at ON public.events;
CREATE TRIGGER trg_events_set_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Status transition guard for request -> accept/reject/reschedule flow.
CREATE OR REPLACE FUNCTION public.validate_event_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT (
            (OLD.status = 'requested' AND NEW.status IN ('pending', 'approved', 'rejected', 'rescheduled'))
            OR (OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected', 'rescheduled'))
            OR (OLD.status = 'rescheduled' AND NEW.status IN ('pending', 'approved', 'rejected'))
            OR (OLD.status = 'approved' AND NEW.status = 'approved')
            OR (OLD.status = 'rejected' AND NEW.status = 'rejected')
        ) THEN
            RAISE EXCEPTION 'Invalid event status transition: % -> %', OLD.status, NEW.status;
        END IF;

        IF NEW.status = 'approved' THEN
            NEW.approved_at = NOW();
        ELSIF NEW.status = 'rejected' THEN
            NEW.rejected_at = NOW();
        ELSIF NEW.status = 'rescheduled' THEN
            NEW.rescheduled_at = NOW();
        END IF;
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
    CONSTRAINT event_participants_status_check CHECK (status IN ('applied', 'confirmed', 'participated', 'donated')),
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
    CONSTRAINT event_approvals_from_status_check CHECK (
        from_status IS NULL OR from_status IN ('requested', 'pending', 'approved', 'rejected', 'rescheduled')
    ),
    CONSTRAINT event_approvals_to_status_check CHECK (to_status IN ('requested', 'pending', 'approved', 'rejected', 'rescheduled')),
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
