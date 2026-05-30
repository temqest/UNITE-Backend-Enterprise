-- migrations/20260531_add_event_coverage_link.sql

-- Add new columns to organization_coverage_areas
ALTER TABLE public.organization_coverage_areas
ADD COLUMN IF NOT EXISTS province TEXT,
ADD COLUMN IF NOT EXISTS municipality TEXT,
ADD COLUMN IF NOT EXISTS barangay TEXT,
ADD COLUMN IF NOT EXISTS normalized_area_key TEXT;

-- Create index for organization_coverage_areas on normalized_area_key and psgc_code for faster event reconciliation matching
CREATE INDEX IF NOT EXISTS coverage_areas_psgc_code_idx ON public.organization_coverage_areas(org_id, psgc_code);
CREATE INDEX IF NOT EXISTS coverage_areas_normalized_key_idx ON public.organization_coverage_areas(org_id, normalized_area_key);

-- Add new columns to events
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS coverage_area_id UUID REFERENCES public.organization_coverage_areas(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS coverage_area_psgc_code TEXT,
ADD COLUMN IF NOT EXISTS coverage_area_boundary_id TEXT,
ADD COLUMN IF NOT EXISTS coverage_area_name TEXT,
ADD COLUMN IF NOT EXISTS coverage_area_province TEXT,
ADD COLUMN IF NOT EXISTS coverage_area_municipality TEXT,
ADD COLUMN IF NOT EXISTS coverage_area_barangay TEXT,
ADD COLUMN IF NOT EXISTS coverage_area_normalized_key TEXT;

-- Create index for events to speed up aggregation queries
CREATE INDEX IF NOT EXISTS events_coverage_area_id_idx ON public.events(org_id, coverage_area_id);
CREATE INDEX IF NOT EXISTS events_coverage_area_psgc_idx ON public.events(org_id, coverage_area_psgc_code);
CREATE INDEX IF NOT EXISTS events_coverage_area_normalized_key_idx ON public.events(org_id, coverage_area_normalized_key);
CREATE INDEX IF NOT EXISTS events_status_date_idx ON public.events(status, event_date);

-- Notice: We are keeping the collected_units, donor_count, successful_donations, deferred_donors, and upcoming_events_count
-- columns in organization_coverage_areas for legacy reasons, but they will no longer be manually updated.
-- The actual values will be computed on the fly by the backend from the events table.
