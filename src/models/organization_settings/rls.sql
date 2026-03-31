-- organization_settings/rls.sql
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

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read settings for their own organization only.
DROP POLICY IF EXISTS organization_settings_select_same_org ON public.organization_settings;
CREATE POLICY organization_settings_select_same_org
ON public.organization_settings
FOR SELECT
TO authenticated
USING (
    org_id = public.current_user_org_id()
);

-- Insert is restricted to super_admin of the same organization.
DROP POLICY IF EXISTS organization_settings_insert_super_admin ON public.organization_settings;
CREATE POLICY organization_settings_insert_super_admin
ON public.organization_settings
FOR INSERT
TO authenticated
WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.current_user_role_type() = 'super_admin'
);

-- Update is restricted to super_admin of the same organization.
DROP POLICY IF EXISTS organization_settings_update_super_admin ON public.organization_settings;
CREATE POLICY organization_settings_update_super_admin
ON public.organization_settings
FOR UPDATE
TO authenticated
USING (
    org_id = public.current_user_org_id()
    AND public.current_user_role_type() = 'super_admin'
)
WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.current_user_role_type() = 'super_admin'
);

-- Delete is restricted to service role or super_admin in same org.
DROP POLICY IF EXISTS organization_settings_delete_super_admin_or_service ON public.organization_settings;
CREATE POLICY organization_settings_delete_super_admin_or_service
ON public.organization_settings
FOR DELETE
TO authenticated
USING (
    (
        org_id = public.current_user_org_id()
        AND public.current_user_role_type() = 'super_admin'
    )
    OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
);
