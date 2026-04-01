BEGIN;

CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.user_role_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    org_id UUID NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    geographic_scope JSONB NULL,
    feature_scope JSONB NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    assigned_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_role_assignments_unique_active
      UNIQUE NULLS NOT DISTINCT (user_id, role_id, org_id, is_active)
);

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    org_id UUID NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    permission_name TEXT NOT NULL,
    is_allowed BOOLEAN NOT NULL,
    reason TEXT NULL,
    created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_permission_overrides_unique
      UNIQUE NULLS NOT DISTINCT (user_id, org_id, permission_name)
);

CREATE INDEX IF NOT EXISTS user_role_assignments_user_id_idx
    ON public.user_role_assignments (user_id);

CREATE INDEX IF NOT EXISTS user_role_assignments_org_id_idx
    ON public.user_role_assignments (org_id);

CREATE INDEX IF NOT EXISTS user_permission_overrides_user_id_idx
    ON public.user_permission_overrides (user_id);

INSERT INTO public.roles (name, description)
VALUES
    ('super_admin', 'Cross-org governance and platform operations'),
    ('admin', 'Organization-wide administration'),
    ('coordinator', 'Operational owner for campaign execution'),
    ('stakeholder', 'Collaborator with limited management actions'),
    ('donor', 'Participation-focused self-service role'),
    ('viewer', 'Read-only visibility role')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.permissions (name, domain, action, description)
VALUES
    ('organization.read', 'organization', 'read', 'Read organization information'),
    ('organization.update', 'organization', 'update', 'Update organization information'),
    ('users.read', 'users', 'read', 'Read user profiles'),
    ('users.invite', 'users', 'invite', 'Invite users'),
    ('users.approve', 'users', 'approve', 'Approve pending users'),
    ('campaigns.read', 'campaigns', 'read', 'Read campaign data'),
    ('campaigns.create', 'campaigns', 'create', 'Create campaigns'),
    ('campaigns.update', 'campaigns', 'update', 'Update campaigns'),
    ('events.read', 'events', 'read', 'Read event data'),
    ('events.create', 'events', 'create', 'Create events'),
    ('events.update', 'events', 'update', 'Update events'),
    ('events.approve', 'events', 'approve', 'Approve events'),
    ('chat.read', 'chat', 'read', 'Read chat and communications'),
    ('chat.write', 'chat', 'write', 'Send chat and communications'),
    ('inventory.read', 'inventory', 'read', 'Read inventory data'),
    ('inventory.update', 'inventory', 'update', 'Manage inventory data'),
    ('documents.read', 'documents', 'read', 'Read documents'),
    ('documents.write', 'documents', 'write', 'Create or update documents'),
    ('reports.read', 'reports', 'read', 'Read reports and analytics'),
    ('reports.export', 'reports', 'export', 'Export reports and analytics'),
    ('settings.read', 'settings', 'read', 'Read system settings'),
    ('settings.update', 'settings', 'update', 'Update system settings')
ON CONFLICT (name) DO NOTHING;

WITH role_permission_map AS (
    SELECT role_name, permission_name
    FROM (
        VALUES
            ('admin', 'organization.read'),
            ('admin', 'organization.update'),
            ('admin', 'users.read'),
            ('admin', 'users.invite'),
            ('admin', 'users.approve'),
            ('admin', 'campaigns.read'),
            ('admin', 'campaigns.create'),
            ('admin', 'campaigns.update'),
            ('admin', 'events.read'),
            ('admin', 'events.create'),
            ('admin', 'events.update'),
            ('admin', 'events.approve'),
            ('admin', 'chat.read'),
            ('admin', 'chat.write'),
            ('admin', 'inventory.read'),
            ('admin', 'inventory.update'),
            ('admin', 'documents.read'),
            ('admin', 'documents.write'),
            ('admin', 'reports.read'),
            ('admin', 'reports.export'),
            ('admin', 'settings.read'),
            ('admin', 'settings.update'),
            ('coordinator', 'campaigns.read'),
            ('coordinator', 'campaigns.create'),
            ('coordinator', 'campaigns.update'),
            ('coordinator', 'events.read'),
            ('coordinator', 'events.create'),
            ('coordinator', 'events.update'),
            ('coordinator', 'chat.read'),
            ('coordinator', 'chat.write'),
            ('coordinator', 'documents.read'),
            ('coordinator', 'documents.write'),
            ('stakeholder', 'campaigns.read'),
            ('stakeholder', 'events.read'),
            ('stakeholder', 'events.update'),
            ('stakeholder', 'chat.read'),
            ('stakeholder', 'documents.read'),
            ('donor', 'campaigns.read'),
            ('donor', 'events.read'),
            ('viewer', 'campaigns.read'),
            ('viewer', 'events.read'),
            ('viewer', 'reports.read')
    ) AS map(role_name, permission_name)
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM role_permission_map map
JOIN public.roles r ON r.name = map.role_name
JOIN public.permissions p ON p.name = map.permission_name
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    unknown_count INTEGER;
BEGIN
    WITH mapped_users AS (
        SELECT
            u.id AS user_id,
            u.org_id,
            CASE LOWER(COALESCE(u.role ->> 'type', ''))
                WHEN 'super_admin' THEN 'super_admin'
                WHEN 'admin' THEN 'admin'
                WHEN 'org_admin' THEN 'admin'
                WHEN 'coordinator' THEN 'coordinator'
                WHEN 'staff' THEN 'coordinator'
                WHEN 'stakeholder' THEN 'stakeholder'
                WHEN 'donor' THEN 'donor'
                WHEN 'viewer' THEN 'viewer'
                WHEN 'volunteer' THEN 'stakeholder'
                ELSE NULL
            END AS mapped_role
        FROM public.users u
    )
    INSERT INTO public.user_role_assignments (user_id, role_id, org_id, is_active)
    SELECT m.user_id, r.id, m.org_id, true
    FROM mapped_users m
    JOIN public.roles r ON r.name = m.mapped_role
    WHERE m.mapped_role IS NOT NULL
    ON CONFLICT DO NOTHING;

    WITH mapped_users AS (
        SELECT
            CASE LOWER(COALESCE(u.role ->> 'type', ''))
                WHEN 'super_admin' THEN 'super_admin'
                WHEN 'admin' THEN 'admin'
                WHEN 'org_admin' THEN 'admin'
                WHEN 'coordinator' THEN 'coordinator'
                WHEN 'staff' THEN 'coordinator'
                WHEN 'stakeholder' THEN 'stakeholder'
                WHEN 'donor' THEN 'donor'
                WHEN 'viewer' THEN 'viewer'
                WHEN 'volunteer' THEN 'stakeholder'
                ELSE NULL
            END AS mapped_role
        FROM public.users u
    )
    SELECT COUNT(*)::INT INTO unknown_count
    FROM mapped_users
    WHERE mapped_role IS NULL;

    IF unknown_count > 0 THEN
        RAISE EXCEPTION 'UNMAPPED_USER_ROLE_TYPES_PRESENT';
    END IF;
END $$;

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
