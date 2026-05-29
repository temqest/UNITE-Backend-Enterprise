-- events/rls.sql
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

CREATE OR REPLACE FUNCTION public.current_user_has_any_permission(required_permissions TEXT[])
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
              OR EXISTS (
                  SELECT 1
                  FROM unnest(required_permissions) AS permission_name
                  WHERE (u.role -> 'permissions') ? permission_name
              )
          )
    );
$$;

ALTER TABLE public.plotting_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plotting_calendar_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plotting_calendar_time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_approvals ENABLE ROW LEVEL SECURITY;

-- PLOTTING CALENDARS ---------------------------------------------------------

DROP POLICY IF EXISTS plotting_calendars_select_accessible ON public.plotting_calendars;
CREATE POLICY plotting_calendars_select_accessible
ON public.plotting_calendars
FOR SELECT
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_has_any_permission(ARRAY['events.read', 'view_events'])
        OR public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
    )
    AND (
        access_type IN ('org', 'organization_link')
        OR public.current_user_profile_id() = ANY(allowed_user_ids)
        OR public.current_user_org_id() = ANY(allowed_organization_ids)
        OR public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
    )
);

DROP POLICY IF EXISTS plotting_calendars_insert_managers ON public.plotting_calendars;
CREATE POLICY plotting_calendars_insert_managers
ON public.plotting_calendars
FOR INSERT
TO authenticated
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR (
            public.current_user_has_any_permission(ARRAY['events.create', 'create_events'])
            AND public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events'])
        )
    )
);

DROP POLICY IF EXISTS plotting_calendars_update_managers ON public.plotting_calendars;
CREATE POLICY plotting_calendars_update_managers
ON public.plotting_calendars
FOR UPDATE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR (
            public.current_user_has_any_permission(ARRAY['events.create', 'create_events'])
            AND public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events'])
        )
    )
)
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR (
            public.current_user_has_any_permission(ARRAY['events.create', 'create_events'])
            AND public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events'])
        )
    )
);

DROP POLICY IF EXISTS plotting_calendars_delete_managers ON public.plotting_calendars;
CREATE POLICY plotting_calendars_delete_managers
ON public.plotting_calendars
FOR DELETE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR public.current_user_has_any_permission(ARRAY['events.delete', 'manage_events'])
    )
);

DROP POLICY IF EXISTS plotting_calendar_days_select_accessible ON public.plotting_calendar_days;
CREATE POLICY plotting_calendar_days_select_accessible
ON public.plotting_calendar_days
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.plotting_calendars calendar
        WHERE calendar.id = plotting_calendar_days.plotting_calendar_id
          AND calendar.org_id = public.current_user_org_id()
          AND (
              public.current_user_has_any_permission(ARRAY['events.read', 'view_events'])
              OR public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
          )
          AND (
              calendar.access_type = 'org'
              OR public.current_user_profile_id() = ANY(calendar.allowed_user_ids)
              OR public.current_user_org_id() = ANY(calendar.allowed_organization_ids)
              OR public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
          )
    )
);

DROP POLICY IF EXISTS plotting_calendar_days_manage ON public.plotting_calendar_days;
CREATE POLICY plotting_calendar_days_manage
ON public.plotting_calendar_days
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.plotting_calendars calendar
        WHERE calendar.id = plotting_calendar_days.plotting_calendar_id
          AND calendar.org_id = public.current_user_org_id()
          AND (
              public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
              OR (
                  public.current_user_has_any_permission(ARRAY['events.create', 'create_events'])
                  AND public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events'])
              )
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.plotting_calendars calendar
        WHERE calendar.id = plotting_calendar_days.plotting_calendar_id
          AND calendar.org_id = public.current_user_org_id()
          AND (
              public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
              OR (
                  public.current_user_has_any_permission(ARRAY['events.create', 'create_events'])
                  AND public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events'])
              )
          )
    )
);

DROP POLICY IF EXISTS plotting_calendar_time_slots_select_accessible ON public.plotting_calendar_time_slots;
CREATE POLICY plotting_calendar_time_slots_select_accessible
ON public.plotting_calendar_time_slots
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.plotting_calendar_days day
        JOIN public.plotting_calendars calendar ON calendar.id = day.plotting_calendar_id
        WHERE day.id = plotting_calendar_time_slots.plotting_calendar_day_id
          AND calendar.org_id = public.current_user_org_id()
          AND (
              public.current_user_has_any_permission(ARRAY['events.read', 'view_events'])
              OR public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
          )
          AND (
              calendar.access_type = 'org'
              OR public.current_user_profile_id() = ANY(calendar.allowed_user_ids)
              OR public.current_user_org_id() = ANY(calendar.allowed_organization_ids)
              OR public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
          )
    )
);

DROP POLICY IF EXISTS plotting_calendar_time_slots_manage ON public.plotting_calendar_time_slots;
CREATE POLICY plotting_calendar_time_slots_manage
ON public.plotting_calendar_time_slots
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.plotting_calendar_days day
        JOIN public.plotting_calendars calendar ON calendar.id = day.plotting_calendar_id
        WHERE day.id = plotting_calendar_time_slots.plotting_calendar_day_id
          AND calendar.org_id = public.current_user_org_id()
          AND (
              public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
              OR (
                  public.current_user_has_any_permission(ARRAY['events.create', 'create_events'])
                  AND public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events'])
              )
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.plotting_calendar_days day
        JOIN public.plotting_calendars calendar ON calendar.id = day.plotting_calendar_id
        WHERE day.id = plotting_calendar_time_slots.plotting_calendar_day_id
          AND calendar.org_id = public.current_user_org_id()
          AND (
              public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
              OR (
                  public.current_user_has_any_permission(ARRAY['events.create', 'create_events'])
                  AND public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events'])
              )
          )
    )
);

-- EVENTS ---------------------------------------------------------------------

DROP POLICY IF EXISTS events_select_same_org ON public.events;
CREATE POLICY events_select_same_org
ON public.events
FOR SELECT
USING (
    org_id = public.current_user_org_id()
    OR (status = 'published' AND setup_status = 'complete' AND (visibility = 'public' OR is_public = true))
);

DROP POLICY IF EXISTS events_insert_same_org_creators ON public.events;
CREATE POLICY events_insert_same_org_creators
ON public.events
FOR INSERT
TO authenticated
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR public.current_user_has_any_permission(ARRAY['events.create', 'create_events'])
    )
);

DROP POLICY IF EXISTS events_update_same_org_managers ON public.events;
CREATE POLICY events_update_same_org_managers
ON public.events
FOR UPDATE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events', 'events.approve', 'approve_events'])
    )
)
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events', 'events.approve', 'approve_events'])
    )
);

DROP POLICY IF EXISTS events_delete_same_org_managers ON public.events;
CREATE POLICY events_delete_same_org_managers
ON public.events
FOR DELETE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_role_type() IN ('admin', 'super_admin')
        OR public.current_user_has_any_permission(ARRAY['events.delete', 'manage_events'])
    )
);

-- EVENT STAFF ----------------------------------------------------------------

DROP POLICY IF EXISTS event_staff_select_same_org ON public.event_staff;
CREATE POLICY event_staff_select_same_org
ON public.event_staff
FOR SELECT
TO authenticated
USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS event_staff_insert_manage_events ON public.event_staff;
CREATE POLICY event_staff_insert_manage_events
ON public.event_staff
FOR INSERT
TO authenticated
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events'])
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
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events'])
    )
)
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events'])
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
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'edit_events'])
    )
);

-- EVENT PARTICIPANTS ---------------------------------------------------------

DROP POLICY IF EXISTS event_participants_select_same_org ON public.event_participants;
CREATE POLICY event_participants_select_same_org
ON public.event_participants
FOR SELECT
TO authenticated
USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS event_participants_insert_apply_or_manage ON public.event_participants;
CREATE POLICY event_participants_insert_apply_or_manage
ON public.event_participants
FOR INSERT
TO authenticated
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'events.apply'])
        OR (
            participant_type = 'user'
            AND participant_user_id = public.current_user_profile_id()
        )
    )
);

DROP POLICY IF EXISTS event_participants_update_manage ON public.event_participants;
CREATE POLICY event_participants_update_manage
ON public.event_participants
FOR UPDATE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'approve_events', 'events.approve'])
    )
)
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'approve_events', 'events.approve'])
    )
);

DROP POLICY IF EXISTS event_participants_delete_super_admin ON public.event_participants;
CREATE POLICY event_participants_delete_super_admin
ON public.event_participants
FOR DELETE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND public.current_user_role_type() IN ('admin', 'super_admin')
);

-- EVENT APPROVALS ------------------------------------------------------------

DROP POLICY IF EXISTS event_approvals_select_same_org ON public.event_approvals;
CREATE POLICY event_approvals_select_same_org
ON public.event_approvals
FOR SELECT
TO authenticated
USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS event_approvals_insert_approvers ON public.event_approvals;
CREATE POLICY event_approvals_insert_approvers
ON public.event_approvals
FOR INSERT
TO authenticated
WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
        public.current_user_role_type() IN ('coordinator', 'admin', 'super_admin')
        OR public.current_user_has_any_permission(ARRAY['events.update', 'manage_events', 'approve_events', 'events.approve'])
    )
);

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
