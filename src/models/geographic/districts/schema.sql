CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.districts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    province_id UUID NOT NULL REFERENCES public.provinces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT districts_name_min_length CHECK (char_length(trim(name)) >= 2),
    CONSTRAINT districts_code_min_length CHECK (char_length(trim(code)) >= 2)
);

CREATE UNIQUE INDEX IF NOT EXISTS districts_id_province_unique_idx
    ON public.districts (id, province_id);

CREATE UNIQUE INDEX IF NOT EXISTS districts_org_code_unique_idx
    ON public.districts (org_id, lower(code))
    WHERE org_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS districts_global_code_unique_idx
    ON public.districts (lower(code))
    WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS districts_province_id_idx
    ON public.districts (province_id);

CREATE INDEX IF NOT EXISTS districts_org_province_idx
    ON public.districts (org_id, province_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_districts_set_updated_at ON public.districts;
CREATE TRIGGER trg_districts_set_updated_at
BEFORE UPDATE ON public.districts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
