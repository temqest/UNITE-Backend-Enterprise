-- organizations/rls.sql
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read only their own organization record.
-- Depends on public.users existing and containing auth_id -> org_id mapping.
DROP POLICY IF EXISTS organizations_select_own_org ON public.organizations;
CREATE POLICY organizations_select_own_org
ON public.organizations
FOR SELECT
TO authenticated
USING (
    id = (
        SELECT u.org_id
        FROM public.users AS u
        WHERE u.auth_id = auth.uid()
        LIMIT 1
    )
);

-- Tenant creation should happen in a controlled provisioning flow.
-- Keep INSERT restricted to service role tokens.
DROP POLICY IF EXISTS organizations_insert_service_role ON public.organizations;
CREATE POLICY organizations_insert_service_role
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
);

-- Only the active super_admin of the same org can update that org.
DROP POLICY IF EXISTS organizations_update_super_admin ON public.organizations;
CREATE POLICY organizations_update_super_admin
ON public.organizations
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.users AS u
        WHERE u.auth_id = auth.uid()
          AND u.org_id = organizations.id
          AND u.is_active = true
          AND u.role ->> 'type' = 'super_admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.users AS u
        WHERE u.auth_id = auth.uid()
          AND u.org_id = organizations.id
          AND u.is_active = true
          AND u.role ->> 'type' = 'super_admin'
    )
);

-- Hard-delete is highly sensitive; keep it service-role only.
DROP POLICY IF EXISTS organizations_delete_service_role ON public.organizations;
CREATE POLICY organizations_delete_service_role
ON public.organizations
FOR DELETE
TO authenticated
USING (
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
);
