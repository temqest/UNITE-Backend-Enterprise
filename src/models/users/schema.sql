-- users/schema.sql
-- App-level user profile linked to Supabase auth.users.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    auth_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role JSONB NOT NULL,
    geographic_area JSONB,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_email_basic_format CHECK (position('@' IN email) > 1),
    CONSTRAINT users_first_name_min_length CHECK (char_length(trim(first_name)) >= 1),
    CONSTRAINT users_last_name_min_length CHECK (char_length(trim(last_name)) >= 1),
    CONSTRAINT users_role_is_valid_json CHECK (
        jsonb_typeof(role) = 'object'
        AND role ? 'type'
        AND jsonb_typeof(role -> 'type') = 'string'
        AND (
            NOT (role ? 'permissions')
            OR jsonb_typeof(role -> 'permissions') = 'array'
        )
    ),
    CONSTRAINT users_geographic_area_is_object_or_null CHECK (
        geographic_area IS NULL OR jsonb_typeof(geographic_area) = 'object'
    )
);

-- Migration-safe cleanup for legacy schemas.
ALTER TABLE public.users
    DROP COLUMN IF EXISTS organization_type;

CREATE INDEX IF NOT EXISTS users_org_id_idx
    ON public.users (org_id);

CREATE INDEX IF NOT EXISTS users_auth_id_idx
    ON public.users (auth_id);

CREATE INDEX IF NOT EXISTS users_is_active_idx
    ON public.users (org_id, is_active);

CREATE INDEX IF NOT EXISTS users_role_type_idx
    ON public.users ((role ->> 'type'));

CREATE INDEX IF NOT EXISTS users_role_permissions_gin_idx
    ON public.users USING GIN ((role -> 'permissions'));

CREATE INDEX IF NOT EXISTS users_geo_area_gin_idx
    ON public.users USING GIN (geographic_area);

CREATE UNIQUE INDEX IF NOT EXISTS users_org_lower_email_unique_idx
    ON public.users (org_id, lower(email));

-- Enforce at most one active super_admin per organization.
CREATE UNIQUE INDEX IF NOT EXISTS users_one_active_super_admin_per_org_idx
    ON public.users (org_id)
    WHERE (role ->> 'type' = 'super_admin' AND is_active = true);

-- Reuse global updated_at trigger function if present; create if missing.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON public.users;
CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Security-definer helpers avoid recursive RLS lookups on public.users itself.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT u.org_id
    FROM public.users AS u
    WHERE u.auth_id = auth.uid()
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_super_admin()
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
          AND u.role ->> 'type' = 'super_admin'
    );
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
