-- src/models/coverage_areas/schema.sql

-- Duplicate of migrations/20260530_add_coverage_areas.sql for documentation purposes.

CREATE TABLE IF NOT EXISTS public.organization_coverage_areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    area_name TEXT NOT NULL,
    area_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    
    psgc_code TEXT,
    geometry JSONB,
    
    target_units INTEGER NOT NULL DEFAULT 0,
    target_donors INTEGER NOT NULL DEFAULT 0,
    collected_units INTEGER NOT NULL DEFAULT 0,
    donor_count INTEGER NOT NULL DEFAULT 0,
    successful_donations INTEGER NOT NULL DEFAULT 0,
    deferred_donors INTEGER NOT NULL DEFAULT 0,
    upcoming_events_count INTEGER NOT NULL DEFAULT 0,
    last_campaign_date DATE,
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

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

ALTER TABLE public.organization_coverage_areas ENABLE ROW LEVEL SECURITY;
