-- notifications/rls.sql
-- Tenant resolver used by notifications-module policies.
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT u.org_id
    FROM public.users AS u
    WHERE u.auth_id = auth.uid()
      AND u.is_active = true
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT u.id
    FROM public.users AS u
    WHERE u.auth_id = auth.uid()
      AND u.is_active = true
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role_type()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT u.role ->> 'type'
    FROM public.users AS u
    WHERE u.auth_id = auth.uid()
      AND u.is_active = true
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_permission(required_permission TEXT)
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
          AND (
              u.role ->> 'type' = 'super_admin'
              OR (u.role -> 'permissions') ? required_permission
          )
    );
$$;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

-- NOTIFICATIONS --------------------------------------------------------------

-- Read notifications in same org only.
-- Direct notifications are visible only to the target user.
-- Broadcast notifications (user_id IS NULL) are visible to all org users.
DROP POLICY IF EXISTS notifications_select_same_org_audience ON public.notifications;
CREATE POLICY notifications_select_same_org_audience
ON public.notifications
FOR SELECT
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND (
        user_id IS NULL
        OR user_id = public.current_user_profile_id()
    )
);

-- Insert notifications in same org only.
-- Intended for backend service workflows, super_admins, or users with send_notifications.
DROP POLICY IF EXISTS notifications_insert_same_org_service_or_permission ON public.notifications;
CREATE POLICY notifications_insert_same_org_service_or_permission
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
        OR public.current_user_has_permission('send_notifications')
        OR public.current_user_has_permission('manage_notifications')
        OR public.current_user_role_type() = 'super_admin'
    )
);

-- Allow users to mark only their direct notifications as read/unread.
DROP POLICY IF EXISTS notifications_update_mark_read_direct_only ON public.notifications;
CREATE POLICY notifications_update_mark_read_direct_only
ON public.notifications
FOR UPDATE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND user_id = public.current_user_profile_id()
)
WITH CHECK (
    org_id = public.current_user_org_id()
    AND user_id = public.current_user_profile_id()
);

-- Optional delete path for admin cleanup and retention jobs.
DROP POLICY IF EXISTS notifications_delete_admin_or_service ON public.notifications;
CREATE POLICY notifications_delete_admin_or_service
ON public.notifications
FOR DELETE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND (
        COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
        OR public.current_user_has_permission('manage_notifications')
        OR public.current_user_role_type() = 'super_admin'
    )
);

-- NOTIFICATION READS ---------------------------------------------------------

-- Users can read only their own broadcast read markers in same org.
DROP POLICY IF EXISTS notification_reads_select_own ON public.notification_reads;
CREATE POLICY notification_reads_select_own
ON public.notification_reads
FOR SELECT
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND user_id = public.current_user_profile_id()
);

-- Users can create read markers for broadcast notifications in same org.
DROP POLICY IF EXISTS notification_reads_insert_own ON public.notification_reads;
CREATE POLICY notification_reads_insert_own
ON public.notification_reads
FOR INSERT
TO authenticated
WITH CHECK (
    org_id = public.current_user_org_id()
    AND user_id = public.current_user_profile_id()
    AND EXISTS (
        SELECT 1
        FROM public.notifications AS n
        WHERE n.id = notification_reads.notification_id
          AND n.org_id = public.current_user_org_id()
          AND n.user_id IS NULL
    )
);

-- Users can update their own read marker timestamp in same org.
DROP POLICY IF EXISTS notification_reads_update_own ON public.notification_reads;
CREATE POLICY notification_reads_update_own
ON public.notification_reads
FOR UPDATE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND user_id = public.current_user_profile_id()
)
WITH CHECK (
    org_id = public.current_user_org_id()
    AND user_id = public.current_user_profile_id()
);
