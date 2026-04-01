-- Fix organization_settings banned_specific_dates validation for consistent ISO date checking.
-- Some PostgreSQL regex environments can behave unexpectedly with \d; use explicit [0-9].

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
            WHERE elem.v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
               OR to_char(to_date(elem.v, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> elem.v
        )
    );
$$;

-- Recreate the check constraint to ensure the updated function is applied consistently.
ALTER TABLE public.organization_settings
    DROP CONSTRAINT IF EXISTS organization_settings_banned_specific_dates_valid;

ALTER TABLE public.organization_settings
    ADD CONSTRAINT organization_settings_banned_specific_dates_valid
    CHECK (public.is_valid_iso_date_array(banned_specific_dates));
