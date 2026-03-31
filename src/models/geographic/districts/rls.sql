CREATE OR REPLACE FUNCTION public.current_user_is_super_admin()
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
          AND u.role ->> 'type' = 'super_admin'
    );
$$;

ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS districts_select_authenticated ON public.districts;
CREATE POLICY districts_select_authenticated
ON public.districts
FOR SELECT
USING (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS districts_insert_super_admin ON public.districts;
CREATE POLICY districts_insert_super_admin
ON public.districts
FOR INSERT
WITH CHECK (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
);

DROP POLICY IF EXISTS districts_update_super_admin ON public.districts;
CREATE POLICY districts_update_super_admin
ON public.districts
FOR UPDATE
USING (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
)
WITH CHECK (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
);

DROP POLICY IF EXISTS districts_delete_super_admin ON public.districts;
CREATE POLICY districts_delete_super_admin
ON public.districts
FOR DELETE
USING (
    auth.role() = 'service_role'
    OR public.current_user_is_super_admin()
);
