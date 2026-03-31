-- Add durable notification email queue + common multi-column performance indexes

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.notification_email_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    payload JSONB NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT notification_email_queue_status_check
        CHECK (status IN ('pending', 'retrying', 'sent', 'failed')),
    CONSTRAINT notification_email_queue_attempts_check
        CHECK (attempts >= 0 AND max_attempts >= 1),
    CONSTRAINT notification_email_queue_payload_is_object
        CHECK (jsonb_typeof(payload) = 'object')
);

ALTER TABLE public.notification_email_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_email_queue_select_service_only ON public.notification_email_queue;
CREATE POLICY notification_email_queue_select_service_only
ON public.notification_email_queue
FOR SELECT
TO authenticated
USING (COALESCE(auth.jwt() ->> 'role', '') = 'service_role');

DROP POLICY IF EXISTS notification_email_queue_insert_service_only ON public.notification_email_queue;
CREATE POLICY notification_email_queue_insert_service_only
ON public.notification_email_queue
FOR INSERT
TO authenticated
WITH CHECK (COALESCE(auth.jwt() ->> 'role', '') = 'service_role');

DROP POLICY IF EXISTS notification_email_queue_update_service_only ON public.notification_email_queue;
CREATE POLICY notification_email_queue_update_service_only
ON public.notification_email_queue
FOR UPDATE
TO authenticated
USING (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
WITH CHECK (COALESCE(auth.jwt() ->> 'role', '') = 'service_role');

DROP POLICY IF EXISTS notification_email_queue_delete_service_only ON public.notification_email_queue;
CREATE POLICY notification_email_queue_delete_service_only
ON public.notification_email_queue
FOR DELETE
TO authenticated
USING (COALESCE(auth.jwt() ->> 'role', '') = 'service_role');

CREATE INDEX IF NOT EXISTS notification_email_queue_status_run_after_idx
    ON public.notification_email_queue (status, run_after ASC);

CREATE INDEX IF NOT EXISTS notification_email_queue_org_user_status_created_idx
    ON public.notification_email_queue (org_id, user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_email_queue_org_type_status_created_idx
    ON public.notification_email_queue (org_id, type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_email_queue_created_idx
    ON public.notification_email_queue (created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_org_user_type_read_created_idx
    ON public.notifications (org_id, user_id, type, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_org_type_read_created_idx
    ON public.notifications (org_id, type, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS events_org_status_date_idx
    ON public.events (org_id, status, event_date);

CREATE INDEX IF NOT EXISTS events_org_type_date_idx
    ON public.events (org_id, type, event_date);

CREATE INDEX IF NOT EXISTS users_org_role_active_idx
    ON public.users (org_id, is_active, role);
