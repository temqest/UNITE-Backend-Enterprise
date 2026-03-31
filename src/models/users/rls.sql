-- users/rls.sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can view users within their own tenant.
DROP POLICY IF EXISTS users_select_same_org ON public.users;
CREATE POLICY users_select_same_org
ON public.users
FOR SELECT
TO authenticated
USING (
    org_id = public.current_org_id()
);

-- Insert allowed to active super_admins in their own org,
-- or users with explicit create_users permission.
DROP POLICY IF EXISTS users_insert_org_admin_or_permission ON public.users;
CREATE POLICY users_insert_org_admin_or_permission
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (
    org_id = public.current_org_id()
    AND (
        public.current_user_is_super_admin()
        OR public.current_user_has_permission('create_users')
    )
);

-- Update allowed to super_admin or users with manage_users permission
-- and only inside the same org.
DROP POLICY IF EXISTS users_update_org_admin_or_permission ON public.users;
CREATE POLICY users_update_org_admin_or_permission
ON public.users
FOR UPDATE
TO authenticated
USING (
    org_id = public.current_org_id()
    AND (
        public.current_user_is_super_admin()
        OR public.current_user_has_permission('manage_users')
    )
)
WITH CHECK (
    org_id = public.current_org_id()
    AND (
        public.current_user_is_super_admin()
        OR public.current_user_has_permission('manage_users')
    )
);

-- Delete limited to super_admin in same org.
DROP POLICY IF EXISTS users_delete_super_admin_only ON public.users;
CREATE POLICY users_delete_super_admin_only
ON public.users
FOR DELETE
TO authenticated
USING (
    org_id = public.current_org_id()
    AND public.current_user_is_super_admin()
);
