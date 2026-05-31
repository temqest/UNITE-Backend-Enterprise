-- migrations/20260530_add_coverage_areas.sql

CREATE TABLE IF NOT EXISTS public.organization_coverage_areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    area_name TEXT NOT NULL,
    area_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    
    -- Optional Geography matching fields
    psgc_code TEXT,
    geometry JSONB,
    
    -- Operational stats
    target_units INTEGER NOT NULL DEFAULT 0,
    target_donors INTEGER NOT NULL DEFAULT 0,
    collected_units INTEGER NOT NULL DEFAULT 0,
    donor_count INTEGER NOT NULL DEFAULT 0,
    successful_donations INTEGER NOT NULL DEFAULT 0,
    deferred_donors INTEGER NOT NULL DEFAULT 0,
    upcoming_events_count INTEGER NOT NULL DEFAULT 0,
    last_campaign_date DATE,
    notes TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

    -- Constraints
    CONSTRAINT coverage_area_type_check CHECK (area_type IN ('city', 'municipality', 'barangay', 'district', 'province')),
    CONSTRAINT coverage_status_check CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT coverage_target_units_non_negative CHECK (target_units >= 0),
    CONSTRAINT coverage_target_donors_non_negative CHECK (target_donors >= 0),
    CONSTRAINT coverage_collected_units_non_negative CHECK (collected_units >= 0),
    CONSTRAINT coverage_donor_count_non_negative CHECK (donor_count >= 0),
    CONSTRAINT coverage_successful_donations_non_negative CHECK (successful_donations >= 0),
    CONSTRAINT coverage_deferred_donors_non_negative CHECK (deferred_donors >= 0),
    CONSTRAINT coverage_upcoming_events_count_non_negative CHECK (upcoming_events_count >= 0)
);

CREATE INDEX IF NOT EXISTS coverage_areas_org_id_idx ON public.organization_coverage_areas(org_id);
CREATE INDEX IF NOT EXISTS coverage_areas_status_idx ON public.organization_coverage_areas(status);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_coverage_areas_set_updated_at ON public.organization_coverage_areas;
CREATE TRIGGER trg_coverage_areas_set_updated_at
BEFORE UPDATE ON public.organization_coverage_areas
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.organization_coverage_areas ENABLE ROW LEVEL SECURITY;

-- Allow users to read coverage areas in their own organization
CREATE POLICY "Users can view coverage areas in their org"
    ON public.organization_coverage_areas
    FOR SELECT
    USING (org_id = public.current_org_id());

-- Insert, Update, Delete allowed for users with permissions in their org (handled via service layer typically, but we restrict to org anyway)
CREATE POLICY "Users can insert coverage areas in their org"
    ON public.organization_coverage_areas
    FOR INSERT
    WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "Users can update coverage areas in their org"
    ON public.organization_coverage_areas
    FOR UPDATE
    USING (org_id = public.current_org_id())
    WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "Users can delete coverage areas in their org"
    ON public.organization_coverage_areas
    FOR DELETE
    USING (org_id = public.current_org_id());

-- Allow service role full access
CREATE POLICY "Service role has full access to coverage areas"
    ON public.organization_coverage_areas
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
