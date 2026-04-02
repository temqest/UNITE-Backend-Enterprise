BEGIN;

ALTER TABLE IF EXISTS public.donor_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS donor_profiles_select_scope ON public.donor_profiles;
CREATE POLICY donor_profiles_select_scope
ON public.donor_profiles
FOR SELECT
USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR EXISTS (
        SELECT 1
        FROM public.users target_user
        JOIN public.users actor_user ON actor_user.auth_id = auth.uid()
        WHERE target_user.id = donor_profiles.user_id
          AND (
              target_user.id = actor_user.id
              OR target_user.org_id = actor_user.org_id
          )
    )
);

DROP POLICY IF EXISTS donor_profiles_insert_self_or_service ON public.donor_profiles;
CREATE POLICY donor_profiles_insert_self_or_service
ON public.donor_profiles
FOR INSERT
WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
    OR EXISTS (
        SELECT 1
        FROM public.users actor_user
        WHERE actor_user.id = donor_profiles.user_id
          AND actor_user.auth_id = auth.uid()
    )
);

DROP POLICY IF EXISTS donor_profiles_update_scope ON public.donor_profiles;
CREATE POLICY donor_profiles_update_scope
ON public.donor_profiles
FOR UPDATE
USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR EXISTS (
        SELECT 1
        FROM public.users actor_user
        WHERE actor_user.id = donor_profiles.user_id
          AND actor_user.auth_id = auth.uid()
    )
)
WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
    OR EXISTS (
        SELECT 1
        FROM public.users actor_user
        WHERE actor_user.id = donor_profiles.user_id
          AND actor_user.auth_id = auth.uid()
    )
);

DROP POLICY IF EXISTS donor_profiles_delete_service_only ON public.donor_profiles;
CREATE POLICY donor_profiles_delete_service_only
ON public.donor_profiles
FOR DELETE
USING (
    auth.jwt() ->> 'role' = 'service_role'
);

COMMIT;
