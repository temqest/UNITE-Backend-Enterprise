-- =====================================================
-- ROW LEVEL SECURITY (RLS) - System Logs
-- =====================================================
-- Access Control:
-- - SELECT: Only super_admin and admin roles with 'view_logs' permission
-- - INSERT: Allowed via triggers and service functions (SECURITY DEFINER)
-- - UPDATE: DENIED (immutable logs)
-- - DELETE: DENIED (only via purge_old_system_logs() with RLS-protected logic)

-- Enable RLS
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- HELPER: Get current user's org_id from users table
-- =====================================================
-- This function should already exist in your setup, but included here for reference

-- CREATE OR REPLACE FUNCTION current_user_org_id()
-- RETURNS UUID AS $$
--     SELECT org_id FROM users WHERE auth_id = auth.uid()
-- $$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =====================================================
-- HELPER: Check if user has specific permission
-- =====================================================

CREATE OR REPLACE FUNCTION user_has_permission(p_permission TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_role_type TEXT;
    v_permissions JSONB;
BEGIN
    -- Get user role type and permissions from users table (role is JSONB: {"type": "admin", "permissions": [...]})
    SELECT role ->> 'type', role -> 'permissions'
    INTO v_role_type, v_permissions
    FROM users
    WHERE auth_id = auth.uid();
    
    -- Super admin has all permissions
    IF v_role_type = 'super_admin' THEN
        RETURN TRUE;
    END IF;
    
    -- Check if admin has specific permission
    IF v_role_type = 'admin' THEN
        -- Option 1: Check if permission exists in role.permissions array
        IF v_permissions IS NOT NULL AND v_permissions ? p_permission THEN
            RETURN TRUE;
        END IF;
        
        -- Option 2: Default permissions for admins (view_logs assumed)
        IF p_permission = 'view_logs' THEN
            RETURN TRUE;
        END IF;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- POLICY: SELECT - View logs only for admin/super_admin with view_logs permission
-- =====================================================

CREATE POLICY system_logs_select_policy ON system_logs
    FOR SELECT
    USING (
        org_id = current_user_org_id() 
        AND user_has_permission('view_logs')
    );

-- =====================================================
-- POLICY: INSERT - Allow inserts via SECURITY DEFINER functions only
-- =====================================================
-- No direct INSERT policy for users
-- All inserts happen via:
-- 1. Triggers (SECURITY DEFINER functions)
-- 2. create_system_log() function (SECURITY DEFINER)
-- 3. Service-layer calls from authenticated backend

-- Allow inserts from service role (for backend services)
CREATE POLICY system_logs_insert_policy ON system_logs
    FOR INSERT
    WITH CHECK (
        -- Only allow if called from SECURITY DEFINER context
        -- In practice, users won't have direct INSERT permission
        -- This is a safety-only policy; real inserts happen via functions
        FALSE
    );

-- =====================================================
-- POLICY: UPDATE - DENY ALL (Logs are immutable)
-- =====================================================

CREATE POLICY system_logs_update_policy ON system_logs
    FOR UPDATE
    USING (FALSE)
    WITH CHECK (FALSE);

-- =====================================================
-- POLICY: DELETE - Only via purge function for super_admin
-- =====================================================

CREATE POLICY system_logs_delete_policy ON system_logs
    FOR DELETE
    USING (
        org_id = current_user_org_id()
        AND EXISTS (
            SELECT 1 FROM users 
            WHERE auth_id = auth.uid() 
            AND role ->> 'type' = 'super_admin'
        )
    );

-- =====================================================
-- BYPASS RLS FOR SERVICE ROLE (Backend services)
-- =====================================================
-- If you have a service role user for backend operations:
-- GRANT USAGE ON SCHEMA public TO service_role;
-- GRANT SELECT, INSERT ON system_logs TO service_role;
-- ALTER TABLE system_logs FORCE ROW LEVEL SECURITY;
-- This ensures even service_role respects RLS, but you can create specific policies

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant to authenticated users (actual access controlled by RLS policies)
GRANT SELECT ON system_logs TO authenticated;

-- No GRANT for INSERT/UPDATE/DELETE to authenticated users
-- (only via SECURITY DEFINER functions)

-- =====================================================
-- REVOKE PUBLIC ACCESS
-- =====================================================

REVOKE ALL ON system_logs FROM anon;
REVOKE ALL ON system_logs FROM public;
