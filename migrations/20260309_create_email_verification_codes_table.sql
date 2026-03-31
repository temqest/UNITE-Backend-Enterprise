-- migrations/20260309_create_email_verification_codes_table.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.email_verification_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    is_used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT code_format CHECK (code ~ '^\d{6}$'),
    CONSTRAINT attempts_non_negative CHECK (attempts >= 0),
    CONSTRAINT max_attempts_positive CHECK (max_attempts > 0)
);

CREATE INDEX IF NOT EXISTS email_verification_codes_auth_user_id_idx
    ON public.email_verification_codes (auth_user_id);

CREATE INDEX IF NOT EXISTS email_verification_codes_email_idx
    ON public.email_verification_codes (email);

CREATE INDEX IF NOT EXISTS email_verification_codes_expires_at_idx
    ON public.email_verification_codes (expires_at);

CREATE INDEX IF NOT EXISTS email_verification_codes_active_codes_idx
    ON public.email_verification_codes (auth_user_id, is_used);

-- RLS Policy: Only service role can access (no public access)
ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_verification_codes_service_role_only" ON public.email_verification_codes
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Deny all other access
DROP POLICY IF EXISTS "email_verification_codes_deny_public" ON public.email_verification_codes;
CREATE POLICY "email_verification_codes_deny_public" ON public.email_verification_codes
    FOR ALL
    USING (false)
    WITH CHECK (false);
