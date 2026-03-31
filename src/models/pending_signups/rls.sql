-- pending_signups/rls.sql
ALTER TABLE public.pending_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_signups_service_role_only ON public.pending_signups;
CREATE POLICY pending_signups_service_role_only
ON public.pending_signups
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS pending_signups_deny_public ON public.pending_signups;
CREATE POLICY pending_signups_deny_public
ON public.pending_signups
FOR ALL
USING (false)
WITH CHECK (false);
