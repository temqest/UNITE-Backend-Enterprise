BEGIN;

ALTER TABLE IF EXISTS public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_read ON public.roles;
CREATE POLICY roles_read
ON public.roles
FOR SELECT
USING (
    auth.jwt() ->> 'role' IN ('authenticated', 'service_role')
);

DROP POLICY IF EXISTS roles_mutate_service ON public.roles;
CREATE POLICY roles_mutate_service
ON public.roles
FOR ALL
USING (
    auth.jwt() ->> 'role' = 'service_role'
)
WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
);

DROP POLICY IF EXISTS permissions_read ON public.permissions;
CREATE POLICY permissions_read
ON public.permissions
FOR SELECT
USING (
    auth.jwt() ->> 'role' IN ('authenticated', 'service_role')
);

DROP POLICY IF EXISTS permissions_mutate_service ON public.permissions;
CREATE POLICY permissions_mutate_service
ON public.permissions
FOR ALL
USING (
    auth.jwt() ->> 'role' = 'service_role'
)
WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
);

DROP POLICY IF EXISTS role_permissions_read ON public.role_permissions;
CREATE POLICY role_permissions_read
ON public.role_permissions
FOR SELECT
USING (
    auth.jwt() ->> 'role' IN ('authenticated', 'service_role')
);

DROP POLICY IF EXISTS role_permissions_mutate_service ON public.role_permissions;
CREATE POLICY role_permissions_mutate_service
ON public.role_permissions
FOR ALL
USING (
    auth.jwt() ->> 'role' = 'service_role'
)
WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
);

DROP POLICY IF EXISTS user_role_assignments_select_scope ON public.user_role_assignments;
CREATE POLICY user_role_assignments_select_scope
ON public.user_role_assignments
FOR SELECT
USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR org_id::text = (auth.jwt() ->> 'org_id')
    OR user_id::text = (auth.jwt() ->> 'sub')
);

DROP POLICY IF EXISTS user_role_assignments_mutate_service ON public.user_role_assignments;
CREATE POLICY user_role_assignments_mutate_service
ON public.user_role_assignments
FOR ALL
USING (
    auth.jwt() ->> 'role' = 'service_role'
)
WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
);

DROP POLICY IF EXISTS user_permission_overrides_select_scope ON public.user_permission_overrides;
CREATE POLICY user_permission_overrides_select_scope
ON public.user_permission_overrides
FOR SELECT
USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR org_id::text = (auth.jwt() ->> 'org_id')
    OR user_id::text = (auth.jwt() ->> 'sub')
);

DROP POLICY IF EXISTS user_permission_overrides_mutate_service ON public.user_permission_overrides;
CREATE POLICY user_permission_overrides_mutate_service
ON public.user_permission_overrides
FOR ALL
USING (
    auth.jwt() ->> 'role' = 'service_role'
)
WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
);

COMMIT;
