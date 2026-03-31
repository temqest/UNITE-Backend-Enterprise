-- Geographic location reference tables (province -> district -> municipality)

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

DROP TRIGGER IF EXISTS trg_provinces_set_updated_at ON public.provinces;
CREATE TRIGGER trg_provinces_set_updated_at
BEFORE UPDATE ON public.provinces
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

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

DROP TRIGGER IF EXISTS trg_districts_set_updated_at ON public.districts;
CREATE TRIGGER trg_districts_set_updated_at
BEFORE UPDATE ON public.districts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

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

DROP TRIGGER IF EXISTS trg_municipalities_set_updated_at ON public.municipalities;
CREATE TRIGGER trg_municipalities_set_updated_at
BEFORE UPDATE ON public.municipalities
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

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

ALTER TABLE public.provinces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipalities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provinces_select_authenticated ON public.provinces;
CREATE POLICY provinces_select_authenticated
ON public.provinces
FOR SELECT
USING (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS provinces_insert_super_admin ON public.provinces;
CREATE POLICY provinces_insert_super_admin
ON public.provinces
FOR INSERT
WITH CHECK (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
);

DROP POLICY IF EXISTS provinces_update_super_admin ON public.provinces;
CREATE POLICY provinces_update_super_admin
ON public.provinces
FOR UPDATE
USING (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
)
WITH CHECK (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
);

DROP POLICY IF EXISTS provinces_delete_super_admin ON public.provinces;
CREATE POLICY provinces_delete_super_admin
ON public.provinces
FOR DELETE
USING (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
);

DROP POLICY IF EXISTS districts_select_authenticated ON public.districts;
CREATE POLICY districts_select_authenticated
ON public.districts
FOR SELECT
USING (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS districts_insert_super_admin ON public.districts;
CREATE POLICY districts_insert_super_admin
ON public.districts
FOR INSERT
WITH CHECK (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
);

DROP POLICY IF EXISTS districts_update_super_admin ON public.districts;
CREATE POLICY districts_update_super_admin
ON public.districts
FOR UPDATE
USING (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
)
WITH CHECK (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
);

DROP POLICY IF EXISTS districts_delete_super_admin ON public.districts;
CREATE POLICY districts_delete_super_admin
ON public.districts
FOR DELETE
USING (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
);

DROP POLICY IF EXISTS municipalities_select_authenticated ON public.municipalities;
CREATE POLICY municipalities_select_authenticated
ON public.municipalities
FOR SELECT
USING (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS municipalities_insert_super_admin ON public.municipalities;
CREATE POLICY municipalities_insert_super_admin
ON public.municipalities
FOR INSERT
WITH CHECK (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
);

DROP POLICY IF EXISTS municipalities_update_super_admin ON public.municipalities;
CREATE POLICY municipalities_update_super_admin
ON public.municipalities
FOR UPDATE
USING (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
)
WITH CHECK (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
);

DROP POLICY IF EXISTS municipalities_delete_super_admin ON public.municipalities;
CREATE POLICY municipalities_delete_super_admin
ON public.municipalities
FOR DELETE
USING (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
);
