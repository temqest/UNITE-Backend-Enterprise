-- organization_settings/schema.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Reuse global updated_at trigger helper.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Validates JSONB arrays of integers in [0, 6] (Sunday to Saturday).
CREATE OR REPLACE FUNCTION public.is_valid_day_of_week_array(value JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT (
        jsonb_typeof(value) = 'array'
        AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(value) AS elem(v)
            WHERE jsonb_typeof(elem.v) <> 'number'
               OR floor((elem.v)::numeric) <> (elem.v)::numeric
               OR (elem.v)::numeric < 0
               OR (elem.v)::numeric > 6
        )
    );
$$;

-- Validates JSONB arrays of ISO date strings in YYYY-MM-DD format.
CREATE OR REPLACE FUNCTION public.is_valid_iso_date_array(value JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT (
        jsonb_typeof(value) = 'array'
        AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(value) AS elem(v)
            WHERE elem.v !~ '^\\d{4}-\\d{2}-\\d{2}$'
               OR to_char(to_date(elem.v, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> elem.v
        )
    );
$$;

CREATE TABLE IF NOT EXISTS public.organization_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Event restrictions.
    max_blood_bags_per_day INTEGER NOT NULL DEFAULT 100,
    max_events_per_day INTEGER NOT NULL DEFAULT 5,
    event_request_advance_days INTEGER NOT NULL DEFAULT 3,
    prevent_double_booking_same_day BOOLEAN NOT NULL DEFAULT true,
    allow_weekend_events BOOLEAN NOT NULL DEFAULT false,
    banned_days_of_week JSONB NOT NULL DEFAULT '[]'::jsonb,
    banned_specific_dates JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Future/extensible org-wide settings.
    config JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT organization_settings_org_id_unique UNIQUE (org_id),
    CONSTRAINT organization_settings_max_blood_bags_per_day_positive CHECK (max_blood_bags_per_day > 0),
    CONSTRAINT organization_settings_max_events_per_day_positive CHECK (max_events_per_day > 0),
    CONSTRAINT organization_settings_event_request_advance_days_non_negative CHECK (event_request_advance_days >= 0),
    CONSTRAINT organization_settings_banned_days_valid CHECK (public.is_valid_day_of_week_array(banned_days_of_week)),
    CONSTRAINT organization_settings_banned_specific_dates_valid CHECK (public.is_valid_iso_date_array(banned_specific_dates)),
    CONSTRAINT organization_settings_config_is_object CHECK (jsonb_typeof(config) = 'object')
);

CREATE INDEX IF NOT EXISTS organization_settings_org_id_idx
    ON public.organization_settings (org_id);

CREATE INDEX IF NOT EXISTS organization_settings_config_gin_idx
    ON public.organization_settings USING GIN (config);

DROP TRIGGER IF EXISTS trg_organization_settings_set_updated_at ON public.organization_settings;
CREATE TRIGGER trg_organization_settings_set_updated_at
BEFORE UPDATE ON public.organization_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
