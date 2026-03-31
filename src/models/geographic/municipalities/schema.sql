CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.municipalities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    district_id UUID NOT NULL,
    province_id UUID NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT municipalities_name_min_length CHECK (char_length(trim(name)) >= 2),
    CONSTRAINT municipalities_code_min_length CHECK (char_length(trim(code)) >= 2),
    CONSTRAINT municipalities_district_fk
        FOREIGN KEY (district_id, province_id)
        REFERENCES public.districts(id, province_id)
        ON DELETE CASCADE,
    CONSTRAINT municipalities_province_fk
        FOREIGN KEY (province_id)
        REFERENCES public.provinces(id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS municipalities_org_code_unique_idx
    ON public.municipalities (org_id, lower(code))
    WHERE org_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS municipalities_global_code_unique_idx
    ON public.municipalities (lower(code))
    WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS municipalities_district_id_idx
    ON public.municipalities (district_id);

CREATE INDEX IF NOT EXISTS municipalities_province_id_idx
    ON public.municipalities (province_id);

CREATE INDEX IF NOT EXISTS municipalities_org_district_idx
    ON public.municipalities (org_id, district_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_municipalities_set_updated_at ON public.municipalities;
CREATE TRIGGER trg_municipalities_set_updated_at
BEFORE UPDATE ON public.municipalities
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
