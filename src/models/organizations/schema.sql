-- organizations/schema.sql
-- Core tenant record for each independent blood bank, hospital, or chapter.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT organizations_name_min_length CHECK (char_length(trim(name)) >= 2),
    CONSTRAINT organizations_code_format CHECK (code ~ '^[A-Z0-9_\-]{3,32}$'),
    CONSTRAINT organizations_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object')
);

-- Migration-safe cleanup for legacy schemas that still have organization type columns.
ALTER TABLE public.organizations
    DROP COLUMN IF EXISTS type,
    DROP COLUMN IF EXISTS org_type,
    DROP COLUMN IF EXISTS organization_type;

-- Use lowercase uniqueness for stable matching and to prevent case-variant duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS organizations_code_unique_idx
    ON public.organizations (lower(code));

CREATE INDEX IF NOT EXISTS organizations_is_active_idx
    ON public.organizations (is_active);

CREATE INDEX IF NOT EXISTS organizations_created_at_idx
    ON public.organizations (created_at);

-- Generic updated_at trigger function can be reused by all tables.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_set_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_set_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
