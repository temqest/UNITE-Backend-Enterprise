export const CANONICAL_ROLES = [
  'super_admin',
  'admin',
  'coordinator',
  'doctor',
  'nurse',
  'stakeholder',
  'donor',
  'viewer',
] as const;

export type CanonicalRole = (typeof CANONICAL_ROLES)[number];

const LEGACY_ROLE_MAP: Record<string, CanonicalRole> = {
  org_admin: 'admin',
  owner: 'admin',
  staff: 'coordinator',
  volunteer: 'stakeholder',
  doctor: 'doctor',
  nurse: 'nurse',
};

export const PERMISSION_CATALOG = [
  'organization.read',
  'organization.update',
  'users.read',
  'users.invite',
  'users.approve',
  'users.manage',
  'campaigns.read',
  'campaigns.create',
  'campaigns.update',
  'events.read',
  'events.create',
  'events.update',
  'events.approve',
  'events.delete',
  'events.reschedule',
  'events.apply',
  'chat.read',
  'chat.write',
  'inventory.read',
  'inventory.update',
  'documents.read',
  'documents.write',
  'reports.read',
  'reports.export',
  'settings.read',
  'settings.update',
] as const;

export type PermissionName = (typeof PERMISSION_CATALOG)[number];

const LEGACY_PERMISSION_MAP: Record<string, string> = {
  approve_staff: 'users.approve',
  manage_staff: 'users.invite',
  manage_users: 'users.invite',
  manage_org_settings: 'settings.update',
  manage_events: 'events.update',
  approve_events: 'events.approve',
  send_notifications: 'chat.write',
  view_logs: 'reports.read',
};

export const ROLE_DEFAULT_PERMISSIONS: Record<CanonicalRole, string[]> = {
  super_admin: ['*'],
  admin: [
    'organization.read',
    'organization.update',
    'users.read',
    'users.invite',
    'users.approve',
    'users.manage',
    'campaigns.read',
    'campaigns.create',
    'campaigns.update',
    'events.read',
    'events.create',
    'events.update',
    'events.approve',
    'events.delete',
    'events.reschedule',
    'chat.read',
    'chat.write',
    'inventory.read',
    'inventory.update',
    'documents.read',
    'documents.write',
    'reports.read',
    'reports.export',
    'settings.read',
    'settings.update',
  ],
  coordinator: [
    'campaigns.read',
    'campaigns.create',
    'campaigns.update',
    'users.invite',
    'events.read',
    'events.create',
    'events.update',
    'events.approve',
    'events.reschedule',
    'chat.read',
    'chat.write',
    'inventory.read',
    'inventory.update',
    'documents.read',
    'documents.write',
    'reports.read',
  ],

  doctor: [
    'events.read',
    'events.approve',
    'events.reschedule',
    'events.update',
    'chat.read',
    'chat.write',
    'inventory.read',
    'inventory.update',
    'documents.read',
    'reports.read',
  ],

  nurse: [
    'events.read',
    'chat.read',
    'chat.write',
    'inventory.read',
    'inventory.update',
    'documents.read',
  ],

  stakeholder: [
    'campaigns.read',
    'events.read',
    'events.create',
    'events.update',
    'chat.read',
    'documents.read',
  ],

  donor: [
    'campaigns.read',
    'events.read',
    'events.apply',
  ],

  viewer: [
    'campaigns.read',
    'events.read',
    'reports.read',
  ],
};

export function resolveCanonicalRole(roleType: string | null | undefined): CanonicalRole {
  const normalized = String(roleType ?? '').trim().toLowerCase();
  if (CANONICAL_ROLES.includes(normalized as CanonicalRole)) {
    return normalized as CanonicalRole;
  }
  return LEGACY_ROLE_MAP[normalized] ?? 'viewer';
}

export function normalizePermission(permission: string): string {
  const normalized = permission.trim().toLowerCase();
  if (!normalized) {
    return normalized;
  }

  const mapped = LEGACY_PERMISSION_MAP[normalized];
  if (mapped) {
    return mapped;
  }

  if (normalized.includes('.')) {
    return normalized;
  }

  return normalized.replace(/_/g, '.');
}
