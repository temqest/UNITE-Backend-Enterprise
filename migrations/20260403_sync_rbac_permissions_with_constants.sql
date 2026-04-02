BEGIN;

-- Ensure permission catalog in DB includes entries used by canonical constants.
INSERT INTO public.permissions (name, domain, action, description)
VALUES
    ('users.manage', 'users', 'manage', 'Manage users'),
    ('events.delete', 'events', 'delete', 'Delete events'),
    ('events.reschedule', 'events', 'reschedule', 'Reschedule events'),
    ('events.apply', 'events', 'apply', 'Apply to events')
ON CONFLICT (name) DO NOTHING;

-- Align DB role_permissions with ROLE_DEFAULT_PERMISSIONS from rbac.constants.ts.
WITH role_permission_map AS (
    SELECT role_name, permission_name
    FROM (
        VALUES
            -- admin
            ('admin', 'organization.read'),
            ('admin', 'organization.update'),
            ('admin', 'users.read'),
            ('admin', 'users.invite'),
            ('admin', 'users.approve'),
            ('admin', 'users.manage'),
            ('admin', 'campaigns.read'),
            ('admin', 'campaigns.create'),
            ('admin', 'campaigns.update'),
            ('admin', 'events.read'),
            ('admin', 'events.create'),
            ('admin', 'events.update'),
            ('admin', 'events.approve'),
            ('admin', 'events.delete'),
            ('admin', 'events.reschedule'),
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

            -- coordinator
            ('coordinator', 'campaigns.read'),
            ('coordinator', 'campaigns.create'),
            ('coordinator', 'campaigns.update'),
            ('coordinator', 'users.invite'),
            ('coordinator', 'events.read'),
            ('coordinator', 'events.create'),
            ('coordinator', 'events.update'),
            ('coordinator', 'events.approve'),
            ('coordinator', 'events.reschedule'),
            ('coordinator', 'chat.read'),
            ('coordinator', 'chat.write'),
            ('coordinator', 'inventory.read'),
            ('coordinator', 'inventory.update'),
            ('coordinator', 'documents.read'),
            ('coordinator', 'documents.write'),
            ('coordinator', 'reports.read'),

            -- doctor
            ('doctor', 'events.read'),
            ('doctor', 'events.approve'),
            ('doctor', 'events.reschedule'),
            ('doctor', 'events.update'),
            ('doctor', 'chat.read'),
            ('doctor', 'chat.write'),
            ('doctor', 'inventory.read'),
            ('doctor', 'inventory.update'),
            ('doctor', 'documents.read'),
            ('doctor', 'reports.read'),

            -- nurse
            ('nurse', 'events.read'),
            ('nurse', 'chat.read'),
            ('nurse', 'chat.write'),
            ('nurse', 'inventory.read'),
            ('nurse', 'inventory.update'),
            ('nurse', 'documents.read'),

            -- stakeholder
            ('stakeholder', 'campaigns.read'),
            ('stakeholder', 'events.read'),
            ('stakeholder', 'events.create'),
            ('stakeholder', 'events.update'),
            ('stakeholder', 'chat.read'),
            ('stakeholder', 'documents.read'),

            -- donor
            ('donor', 'campaigns.read'),
            ('donor', 'events.read'),
            ('donor', 'events.apply'),

            -- viewer
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

COMMIT;
