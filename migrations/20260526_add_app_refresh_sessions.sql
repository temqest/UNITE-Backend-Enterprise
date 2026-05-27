BEGIN;

CREATE TABLE IF NOT EXISTS public.app_refresh_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL UNIQUE,
    supabase_session_id UUID NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    revoked_reason TEXT NULL,
    user_agent TEXT NULL,
    ip_address INET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_refresh_sessions_user_id_idx
    ON public.app_refresh_sessions (user_id);

CREATE INDEX IF NOT EXISTS app_refresh_sessions_auth_user_id_idx
    ON public.app_refresh_sessions (auth_user_id);

CREATE INDEX IF NOT EXISTS app_refresh_sessions_expires_at_idx
    ON public.app_refresh_sessions (expires_at);

CREATE INDEX IF NOT EXISTS app_refresh_sessions_active_idx
    ON public.app_refresh_sessions (user_id, expires_at)
    WHERE revoked_at IS NULL;

DROP TRIGGER IF EXISTS trg_app_refresh_sessions_set_updated_at ON public.app_refresh_sessions;
CREATE TRIGGER trg_app_refresh_sessions_set_updated_at
BEFORE UPDATE ON public.app_refresh_sessions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.app_refresh_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_refresh_sessions_service_role_all ON public.app_refresh_sessions;
CREATE POLICY app_refresh_sessions_service_role_all
ON public.app_refresh_sessions
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

REVOKE ALL ON TABLE public.app_refresh_sessions FROM anon;
REVOKE ALL ON TABLE public.app_refresh_sessions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_refresh_sessions TO service_role;

COMMIT;
