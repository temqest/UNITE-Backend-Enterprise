import { supabaseServer } from '../../lib/supabase/supabase.client';
import {
  ROLE_DEFAULT_PERMISSIONS,
  normalizePermission,
  resolveCanonicalRole,
  type CanonicalRole,
} from './rbac.constants';

export interface AuthzUser {
  id: string;
  org_id?: string;
  role?: {
    type?: string;
    permissions?: string[];
  };
}

export interface ResolvedAuthz {
  role: CanonicalRole;
  permissions: string[];
}

function dedupePermissions(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizePermission).filter(Boolean)));
}

export function getFallbackPermissions(user: AuthzUser): string[] {
  const canonicalRole = resolveCanonicalRole(user.role?.type);
  const stored = Array.isArray(user.role?.permissions) ? user.role?.permissions : [];
  const roleDefaults = ROLE_DEFAULT_PERMISSIONS[canonicalRole] ?? [];

  if (canonicalRole === 'super_admin') {
    return ['*'];
  }

  return dedupePermissions([...roleDefaults, ...stored]);
}

export async function resolveUserAuthorization(user: AuthzUser): Promise<ResolvedAuthz> {
  const canonicalRole = resolveCanonicalRole(user.role?.type);

  if (!user.id) {
    return { role: canonicalRole, permissions: [] };
  }

  if (canonicalRole === 'super_admin') {
    return { role: canonicalRole, permissions: ['*'] };
  }

  try {
    const assignmentsQuery = supabaseServer
      .from('user_role_assignments')
      .select('role_id, org_id, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const scopedAssignments = user.org_id
      ? assignmentsQuery.or(`org_id.eq.${user.org_id},org_id.is.null`)
      : assignmentsQuery;

    const { data: assignments, error: assignmentsError } = await scopedAssignments;

    if (assignmentsError || !assignments || assignments.length === 0) {
      return {
        role: canonicalRole,
        permissions: getFallbackPermissions(user),
      };
    }

    const roleIds = assignments
      .map((assignment: any) => assignment.role_id)
      .filter((roleId: unknown): roleId is string => typeof roleId === 'string' && roleId.length > 0);

    if (roleIds.length === 0) {
      return {
        role: canonicalRole,
        permissions: getFallbackPermissions(user),
      };
    }

    const { data: rolePermissions, error: rolePermissionsError } = await supabaseServer
      .from('role_permissions')
      .select('permission_id')
      .in('role_id', roleIds);

    if (rolePermissionsError || !rolePermissions || rolePermissions.length === 0) {
      return {
        role: canonicalRole,
        permissions: getFallbackPermissions(user),
      };
    }

    const permissionIds = rolePermissions
      .map((row: any) => row.permission_id)
      .filter((permissionId: unknown): permissionId is string => typeof permissionId === 'string' && permissionId.length > 0);

    if (permissionIds.length === 0) {
      return {
        role: canonicalRole,
        permissions: getFallbackPermissions(user),
      };
    }

    const { data: permissionsRows, error: permissionsError } = await supabaseServer
      .from('permissions')
      .select('name')
      .in('id', permissionIds);

    if (permissionsError || !permissionsRows) {
      return {
        role: canonicalRole,
        permissions: getFallbackPermissions(user),
      };
    }

    const tablePermissions = permissionsRows
      .map((row: any) => row.name)
      .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0);

    const { data: overridesRows } = await supabaseServer
      .from('user_permission_overrides')
      .select('permission_name, is_allowed')
      .eq('user_id', user.id)
      .or(user.org_id ? `org_id.eq.${user.org_id},org_id.is.null` : 'org_id.is.null');

    const allowOverrides: string[] = [];
    const denyOverrides: string[] = [];
    for (const row of (overridesRows ?? []) as Array<{ permission_name?: unknown; is_allowed?: unknown }>) {
      if (typeof row.permission_name !== 'string') {
        continue;
      }
      const normalized = normalizePermission(row.permission_name);
      if (!normalized) {
        continue;
      }
      if (row.is_allowed === false) {
        denyOverrides.push(normalized);
      } else if (row.is_allowed === true) {
        allowOverrides.push(normalized);
      }
    }

    const merged = dedupePermissions([...tablePermissions, ...allowOverrides]);
    const deniedSet = new Set(denyOverrides);
    const effective = merged.filter((permission) => !deniedSet.has(permission));

    return {
      role: canonicalRole,
      permissions: effective,
    };
  } catch {
    return {
      role: canonicalRole,
      permissions: getFallbackPermissions(user),
    };
  }
}

export async function hasPermission(user: AuthzUser, requiredPermission: string): Promise<boolean> {
  const required = normalizePermission(requiredPermission);
  if (!required) {
    return true;
  }

  const resolved = await resolveUserAuthorization(user);
  return resolved.permissions.includes('*') || resolved.permissions.includes(required);
}
