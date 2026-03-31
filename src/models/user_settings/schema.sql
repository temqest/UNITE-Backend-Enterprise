-- user_settings/schema.sql
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

CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Personal notification toggles.
    enable_email_notifications BOOLEAN NOT NULL DEFAULT true,
    enable_in_app_notifications BOOLEAN NOT NULL DEFAULT true,
    enable_all_notifications BOOLEAN NOT NULL DEFAULT true,

    -- Future/extensible user preferences.
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT user_settings_user_id_unique UNIQUE (user_id),
    CONSTRAINT user_settings_preferences_is_object CHECK (jsonb_typeof(preferences) = 'object')
);

CREATE INDEX IF NOT EXISTS user_settings_org_id_idx
    ON public.user_settings (org_id);

CREATE INDEX IF NOT EXISTS user_settings_user_id_idx
    ON public.user_settings (user_id);

CREATE INDEX IF NOT EXISTS user_settings_preferences_gin_idx
    ON public.user_settings USING GIN (preferences);

DROP TRIGGER IF EXISTS trg_user_settings_set_updated_at ON public.user_settings;
CREATE TRIGGER trg_user_settings_set_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Enforce that user_settings.user_id belongs to user_settings.org_id.
CREATE OR REPLACE FUNCTION public.validate_user_settings_org_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_org_id UUID;
BEGIN
    SELECT u.org_id INTO v_user_org_id
    FROM public.users AS u
    WHERE u.id = NEW.user_id;

    IF v_user_org_id IS NULL THEN
        RAISE EXCEPTION 'User not found: %', NEW.user_id;
    END IF;

    IF v_user_org_id <> NEW.org_id THEN
        RAISE EXCEPTION 'user_settings.user_id must belong to the same org_id';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_settings_validate_org_match ON public.user_settings;
CREATE TRIGGER trg_user_settings_validate_org_match
BEFORE INSERT OR UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.validate_user_settings_org_match();
