-- pending_signups/schema.sql
-- Temporary signup staging table used until OTP verification is successful.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.pending_signups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    signup_type TEXT NOT NULL,
    role TEXT NOT NULL,
    org_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT,
    organization_payload JSONB,
    profile_payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pending_signups_email_basic_format
        CHECK (position('@' IN email) > 1),
    CONSTRAINT pending_signups_signup_type_check
        CHECK (signup_type IN ('admin', 'staff')),
    CONSTRAINT pending_signups_role_check
        CHECK (role IN ('super_admin', 'staff')),
    CONSTRAINT pending_signups_status_check
        CHECK (status IN ('pending', 'completed', 'expired', 'cancelled')),
    CONSTRAINT pending_signups_admin_org_payload_required
        CHECK (
            (signup_type = 'admin' AND organization_payload IS NOT NULL)
            OR (signup_type = 'staff' AND organization_payload IS NULL)
        ),
    CONSTRAINT pending_signups_staff_org_id_required
        CHECK (
            (signup_type = 'staff' AND org_id IS NOT NULL)
            OR (signup_type = 'admin' AND org_id IS NULL)
        ),
    CONSTRAINT pending_signups_profile_payload_is_object
        CHECK (jsonb_typeof(profile_payload) = 'object'),
    CONSTRAINT pending_signups_organization_payload_is_object_or_null
        CHECK (organization_payload IS NULL OR jsonb_typeof(organization_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS pending_signups_email_status_idx
    ON public.pending_signups (lower(email), status);

CREATE INDEX IF NOT EXISTS pending_signups_expires_at_idx
    ON public.pending_signups (expires_at);

CREATE INDEX IF NOT EXISTS pending_signups_org_id_status_idx
    ON public.pending_signups (org_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS pending_signups_active_email_unique_idx
    ON public.pending_signups (lower(email))
    WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pending_signups_set_updated_at ON public.pending_signups;
CREATE TRIGGER trg_pending_signups_set_updated_at
BEFORE UPDATE ON public.pending_signups
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
