-- notifications/schema.sql
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

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    priority TEXT NOT NULL DEFAULT 'normal',
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT notifications_type_min_length CHECK (char_length(trim(type)) >= 2),
    CONSTRAINT notifications_title_min_length CHECK (char_length(trim(title)) >= 3),
    CONSTRAINT notifications_message_min_length CHECK (char_length(trim(message)) >= 1),
    CONSTRAINT notifications_data_is_object CHECK (jsonb_typeof(data) = 'object'),
    CONSTRAINT notifications_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    CONSTRAINT notifications_read_state_consistency CHECK (
        (is_read = true AND read_at IS NOT NULL)
        OR (is_read = false AND read_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS notifications_org_id_idx
    ON public.notifications (org_id);

CREATE INDEX IF NOT EXISTS notifications_org_user_created_idx
    ON public.notifications (org_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_org_priority_created_idx
    ON public.notifications (org_id, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_org_category_created_idx
    ON public.notifications (org_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_org_unread_idx
    ON public.notifications (org_id, user_id, created_at DESC)
    WHERE is_read = false;

CREATE INDEX IF NOT EXISTS notifications_data_gin_idx
    ON public.notifications USING GIN (data);

DROP TRIGGER IF EXISTS trg_notifications_set_updated_at ON public.notifications;
CREATE TRIGGER trg_notifications_set_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- For broadcast notifications (user_id IS NULL), store read markers per user.
CREATE TABLE IF NOT EXISTS public.notification_reads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT true,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT notification_reads_unique_notification_user UNIQUE (notification_id, user_id),
    CONSTRAINT notification_reads_is_read_true CHECK (is_read = true)
);

CREATE INDEX IF NOT EXISTS notification_reads_org_user_idx
    ON public.notification_reads (org_id, user_id, read_at DESC);

CREATE INDEX IF NOT EXISTS notification_reads_notification_id_idx
    ON public.notification_reads (notification_id);

DROP TRIGGER IF EXISTS trg_notification_reads_set_updated_at ON public.notification_reads;
CREATE TRIGGER trg_notification_reads_set_updated_at
BEFORE UPDATE ON public.notification_reads
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Enforce org consistency across notification and read marker rows.
CREATE OR REPLACE FUNCTION public.validate_notification_reads_org_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_notification_org_id UUID;
    v_user_org_id UUID;
BEGIN
    SELECT n.org_id INTO v_notification_org_id
    FROM public.notifications AS n
    WHERE n.id = NEW.notification_id;

    IF v_notification_org_id IS NULL THEN
        RAISE EXCEPTION 'Notification not found: %', NEW.notification_id;
    END IF;

    IF v_notification_org_id <> NEW.org_id THEN
        RAISE EXCEPTION 'notification_reads.org_id must match notifications.org_id';
    END IF;

    SELECT u.org_id INTO v_user_org_id
    FROM public.users AS u
    WHERE u.id = NEW.user_id;

    IF v_user_org_id IS NULL THEN
        RAISE EXCEPTION 'User not found: %', NEW.user_id;
    END IF;

    IF v_user_org_id <> NEW.org_id THEN
        RAISE EXCEPTION 'notification_reads.user_id must belong to the same org_id';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_reads_validate_org_match ON public.notification_reads;
CREATE TRIGGER trg_notification_reads_validate_org_match
BEFORE INSERT OR UPDATE ON public.notification_reads
FOR EACH ROW
EXECUTE FUNCTION public.validate_notification_reads_org_match();
