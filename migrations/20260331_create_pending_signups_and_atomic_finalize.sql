-- Atomic signup staging and finalization

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

ALTER TABLE public.pending_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_signups_service_role_only ON public.pending_signups;
CREATE POLICY pending_signups_service_role_only
ON public.pending_signups
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS pending_signups_deny_public ON public.pending_signups;
CREATE POLICY pending_signups_deny_public
ON public.pending_signups
FOR ALL
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.finalize_pending_signup(
    p_auth_user_id UUID,
    p_email TEXT,
    p_verification_code_id UUID
)
RETURNS TABLE(org_id UUID, user_id UUID, signup_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pending public.pending_signups%ROWTYPE;
    v_org_id UUID;
    v_user_id UUID;
    v_role JSONB;
    v_org_name TEXT;
    v_org_code TEXT;
    v_org_contact_email TEXT;
    v_org_contact_phone TEXT;
    v_org_metadata JSONB;
    v_first_name TEXT;
    v_last_name TEXT;
    v_geo JSONB;
BEGIN
    SELECT * INTO v_pending
    FROM public.pending_signups
    WHERE auth_user_id = p_auth_user_id
      AND lower(email) = lower(p_email)
      AND status = 'pending'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PENDING_SIGNUP_NOT_FOUND';
    END IF;

    IF v_pending.expires_at < NOW() THEN
        RAISE EXCEPTION 'PENDING_SIGNUP_EXPIRED';
    END IF;

    UPDATE public.email_verification_codes
    SET is_used = true
    WHERE id = p_verification_code_id
      AND auth_user_id = p_auth_user_id
      AND lower(email) = lower(p_email)
      AND is_used = false;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'VERIFICATION_CODE_NOT_ACTIVE';
    END IF;

    SELECT id INTO v_user_id
    FROM public.users
    WHERE auth_id = p_auth_user_id
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        RAISE EXCEPTION 'USER_PROFILE_ALREADY_EXISTS';
    END IF;

    v_first_name := COALESCE(NULLIF(trim(v_pending.profile_payload ->> 'first_name'), ''), 'User');
    v_last_name := COALESCE(NULLIF(trim(v_pending.profile_payload ->> 'last_name'), ''), 'User');
    v_geo := v_pending.profile_payload -> 'geographic_area';

    IF v_pending.signup_type = 'admin' THEN
        v_org_name := v_pending.organization_payload ->> 'name';
        v_org_code := upper(trim(v_pending.organization_payload ->> 'code'));
        v_org_contact_email := NULLIF(trim(v_pending.organization_payload ->> 'contact_email'), '');
        v_org_contact_phone := NULLIF(trim(v_pending.organization_payload ->> 'contact_phone'), '');
        v_org_metadata := COALESCE(v_pending.organization_payload -> 'metadata', '{}'::jsonb);

        IF v_org_name IS NULL OR v_org_code IS NULL THEN
            RAISE EXCEPTION 'PENDING_ORGANIZATION_PAYLOAD_INVALID';
        END IF;

        INSERT INTO public.organizations (name, code, contact_email, contact_phone, metadata, is_active)
        VALUES (v_org_name, v_org_code, v_org_contact_email, v_org_contact_phone, v_org_metadata, true)
        RETURNING id INTO v_org_id;

        v_role := jsonb_build_object('type', 'super_admin', 'permissions', jsonb_build_array('*'));
    ELSIF v_pending.signup_type = 'staff' THEN
        v_org_id := v_pending.org_id;
        IF v_org_id IS NULL THEN
            RAISE EXCEPTION 'PENDING_STAFF_ORG_MISSING';
        END IF;

        PERFORM 1 FROM public.organizations WHERE id = v_org_id AND is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'ORGANIZATION_NOT_ACTIVE';
        END IF;

        v_role := jsonb_build_object('type', 'staff', 'permissions', jsonb_build_array());
    ELSE
        RAISE EXCEPTION 'PENDING_SIGNUP_TYPE_INVALID';
    END IF;

    INSERT INTO public.users (
        org_id,
        auth_id,
        email,
        first_name,
        last_name,
        role,
        geographic_area,
        is_active
    ) VALUES (
        v_org_id,
        p_auth_user_id,
        lower(trim(p_email)),
        v_first_name,
        v_last_name,
        v_role,
        CASE WHEN v_geo IS NULL OR jsonb_typeof(v_geo) <> 'object' THEN NULL ELSE v_geo END,
        true
    )
    RETURNING id INTO v_user_id;

    UPDATE public.pending_signups
    SET status = 'completed',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_pending.id;

    INSERT INTO public.system_logs (
        org_id,
        user_id,
        category,
        action_type,
        entity_type,
        entity_id,
        payload,
        status,
        notes
    ) VALUES (
        v_org_id,
        v_user_id,
        'users',
        'user_created',
        'user',
        v_user_id,
        jsonb_build_object(
            'signup_type', v_pending.signup_type,
            'auth_user_id', p_auth_user_id,
            'email', lower(trim(p_email))
        ),
        'completed',
        'User finalized through OTP verification flow'
    );

    org_id := v_org_id;
    user_id := v_user_id;
    signup_type := v_pending.signup_type;

    RETURN NEXT;
END;
$$;
