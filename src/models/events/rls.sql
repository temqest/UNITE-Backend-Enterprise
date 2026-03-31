-- events/rls.sql
-- Tenant resolver used by all events-module policies.
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

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_approvals ENABLE ROW LEVEL SECURITY;

-- EVENTS ---------------------------------------------------------------------

-- Read events: org members see all events, public events visible to everyone
DROP POLICY IF EXISTS events_select_same_org ON public.events;
CREATE POLICY events_select_same_org
ON public.events
FOR SELECT
USING (
    org_id = public.current_user_org_id()
    OR is_public = true
);

-- Create event requests in same org.
DROP POLICY IF EXISTS events_insert_request_same_org ON public.events;
CREATE POLICY events_insert_request_same_org
ON public.events
FOR INSERT
TO authenticated
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_has_permission('create_events')
        OR public.current_user_has_permission('manage_events')
        OR public.current_user_role_type() = 'super_admin'
    )
);

-- Update events inside same org with event-management permissions.
DROP POLICY IF EXISTS events_update_same_org_managers ON public.events;
CREATE POLICY events_update_same_org_managers
ON public.events
FOR UPDATE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_has_permission('manage_events')
        OR public.current_user_has_permission('approve_events')
        OR public.current_user_role_type() = 'super_admin'
    )
)
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_has_permission('manage_events')
        OR public.current_user_has_permission('approve_events')
        OR public.current_user_role_type() = 'super_admin'
    )
);

-- Delete events reserved to super_admin.
DROP POLICY IF EXISTS events_delete_super_admin ON public.events;
CREATE POLICY events_delete_super_admin
ON public.events
FOR DELETE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND public.current_user_role_type() = 'super_admin'
);

-- EVENT STAFF ----------------------------------------------------------------

-- Read assigned staff in same org.
DROP POLICY IF EXISTS event_staff_select_same_org ON public.event_staff;
CREATE POLICY event_staff_select_same_org
ON public.event_staff
FOR SELECT
TO authenticated
USING (
    org_id = public.current_user_org_id()
);

-- Assign staff only with manage_events permission.
DROP POLICY IF EXISTS event_staff_insert_manage_events ON public.event_staff;
CREATE POLICY event_staff_insert_manage_events
ON public.event_staff
FOR INSERT
TO authenticated
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_has_permission('manage_events')
        OR public.current_user_role_type() = 'super_admin'
    )
);

DROP POLICY IF EXISTS event_staff_update_manage_events ON public.event_staff;
CREATE POLICY event_staff_update_manage_events
ON public.event_staff
FOR UPDATE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_has_permission('manage_events')
        OR public.current_user_role_type() = 'super_admin'
    )
)
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_has_permission('manage_events')
        OR public.current_user_role_type() = 'super_admin'
    )
);

DROP POLICY IF EXISTS event_staff_delete_manage_events ON public.event_staff;
CREATE POLICY event_staff_delete_manage_events
ON public.event_staff
FOR DELETE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_has_permission('manage_events')
        OR public.current_user_role_type() = 'super_admin'
    )
);

-- EVENT PARTICIPANTS ---------------------------------------------------------

-- Read participants in same org.
DROP POLICY IF EXISTS event_participants_select_same_org ON public.event_participants;
CREATE POLICY event_participants_select_same_org
ON public.event_participants
FOR SELECT
TO authenticated
USING (
    org_id = public.current_user_org_id()
);

-- Allow participant applications in same org.
-- Users may apply for themselves; managers can add any participant.
DROP POLICY IF EXISTS event_participants_insert_apply_or_manage ON public.event_participants;
CREATE POLICY event_participants_insert_apply_or_manage
ON public.event_participants
FOR INSERT
TO authenticated
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_has_permission('manage_participants')
        OR public.current_user_has_permission('manage_events')
        OR public.current_user_role_type() = 'super_admin'
        OR (
            participant_type = 'user'
            AND participant_user_id = public.current_user_profile_id()
        )
    )
);

-- Status updates for participant workflow require manager/approval capability.
DROP POLICY IF EXISTS event_participants_update_manage ON public.event_participants;
CREATE POLICY event_participants_update_manage
ON public.event_participants
FOR UPDATE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_has_permission('manage_participants')
        OR public.current_user_has_permission('approve_events')
        OR public.current_user_role_type() = 'super_admin'
    )
)
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_has_permission('manage_participants')
        OR public.current_user_has_permission('approve_events')
        OR public.current_user_role_type() = 'super_admin'
    )
);

DROP POLICY IF EXISTS event_participants_delete_super_admin ON public.event_participants;
CREATE POLICY event_participants_delete_super_admin
ON public.event_participants
FOR DELETE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND public.current_user_role_type() = 'super_admin'
);

-- EVENT APPROVALS ------------------------------------------------------------

-- Read approvals in same org only.
DROP POLICY IF EXISTS event_approvals_select_same_org ON public.event_approvals;
CREATE POLICY event_approvals_select_same_org
ON public.event_approvals
FOR SELECT
TO authenticated
USING (
    org_id = public.current_user_org_id()
);

-- Insert approval decisions in same org by approvers.
DROP POLICY IF EXISTS event_approvals_insert_approvers ON public.event_approvals;
CREATE POLICY event_approvals_insert_approvers
ON public.event_approvals
FOR INSERT
TO authenticated
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_role_type() = 'super_admin'
        OR public.current_user_has_permission('approve_events')
        OR public.current_user_role_type() IN ('admin', 'coordinator', 'stakeholder')
    )
);

-- Approval history is append-only for audit integrity.
DROP POLICY IF EXISTS event_approvals_update_none ON public.event_approvals;
CREATE POLICY event_approvals_update_none
ON public.event_approvals
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS event_approvals_delete_none ON public.event_approvals;
CREATE POLICY event_approvals_delete_none
ON public.event_approvals
FOR DELETE
TO authenticated
USING (false);
