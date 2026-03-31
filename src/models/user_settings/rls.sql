-- user_settings/rls.sql
-- Tenant resolver helper used by module policies.
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

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Users can read only their own settings row.
DROP POLICY IF EXISTS user_settings_select_own ON public.user_settings;
CREATE POLICY user_settings_select_own
ON public.user_settings
FOR SELECT
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND user_id = public.current_user_profile_id()
);

-- Users can insert only their own settings row.
DROP POLICY IF EXISTS user_settings_insert_own ON public.user_settings;
CREATE POLICY user_settings_insert_own
ON public.user_settings
FOR INSERT
TO authenticated
WITH CHECK (
    org_id = public.current_user_org_id()
    AND user_id = public.current_user_profile_id()
);

-- Users can update only their own settings row.
DROP POLICY IF EXISTS user_settings_update_own ON public.user_settings;
CREATE POLICY user_settings_update_own
ON public.user_settings
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

-- Delete restricted to service role and super_admin in same org.
DROP POLICY IF EXISTS user_settings_delete_super_admin_or_service ON public.user_settings;
CREATE POLICY user_settings_delete_super_admin_or_service
ON public.user_settings
FOR DELETE
TO authenticated
USING (
    (
        org_id = public.current_user_org_id()
        AND public.current_user_role_type() = 'super_admin'
    )
    OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
);
