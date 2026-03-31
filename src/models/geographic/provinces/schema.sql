CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.provinces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    region TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT provinces_name_min_length CHECK (char_length(trim(name)) >= 2),
    CONSTRAINT provinces_code_min_length CHECK (char_length(trim(code)) >= 2),
    CONSTRAINT provinces_region_min_length CHECK (char_length(trim(region)) >= 2)
);

CREATE UNIQUE INDEX IF NOT EXISTS provinces_org_code_unique_idx
    ON public.provinces (org_id, lower(code))
    WHERE org_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS provinces_global_code_unique_idx
    ON public.provinces (lower(code))
    WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS provinces_region_idx
    ON public.provinces (region);

CREATE INDEX IF NOT EXISTS provinces_org_region_idx
    ON public.provinces (org_id, region);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provinces_set_updated_at ON public.provinces;
CREATE TRIGGER trg_provinces_set_updated_at
BEFORE UPDATE ON public.provinces
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
