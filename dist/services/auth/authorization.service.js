"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearAuthzCache = clearAuthzCache;
exports.getFallbackPermissions = getFallbackPermissions;
exports.resolveUserAuthorization = resolveUserAuthorization;
exports.hasPermission = hasPermission;
const supabase_client_1 = require("../../lib/supabase/supabase.client");
const rbac_constants_1 = require("./rbac.constants");
const authzCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds
function clearAuthzCache(userId) {
    if (userId) {
        for (const key of authzCache.keys()) {
            if (key.startsWith(`${userId}:`)) {
                authzCache.delete(key);
            }
        }
    }
    else {
        authzCache.clear();
    }
}
function dedupePermissions(values) {
    return Array.from(new Set(values.map(rbac_constants_1.normalizePermission).filter(Boolean)));
}
function getFallbackPermissions(user) {
    const canonicalRole = (0, rbac_constants_1.resolveCanonicalRole)(user.role?.type);
    const stored = Array.isArray(user.role?.permissions) ? user.role?.permissions : [];
    const roleDefaults = rbac_constants_1.ROLE_DEFAULT_PERMISSIONS[canonicalRole] ?? [];
    if (canonicalRole === 'super_admin') {
        return ['*'];
    }
    return dedupePermissions([...roleDefaults, ...stored]);
}
function cacheAndReturn(cacheKey, result) {
    const now = Date.now();
    if (authzCache.size > 500) {
        for (const [k, v] of authzCache.entries()) {
            if (v.expiresAt <= now) {
                authzCache.delete(k);
            }
        }
    }
    authzCache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, data: result });
    return result;
}
async function resolveUserAuthorization(user) {
    const canonicalRole = (0, rbac_constants_1.resolveCanonicalRole)(user.role?.type);
    if (!user.id) {
        return { role: canonicalRole, permissions: [] };
    }
    if (canonicalRole === 'super_admin') {
        return { role: canonicalRole, permissions: ['*'] };
    }
    const cacheKey = `${user.id}:${user.org_id ?? ''}:${user.role?.type ?? ''}`;
    const now = Date.now();
    const cached = authzCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.data;
    }
    try {
        const assignmentsQuery = supabase_client_1.supabaseServer
            .from('user_role_assignments')
            .select('role_id, org_id, is_active')
            .eq('user_id', user.id)
            .eq('is_active', true);
        const scopedAssignments = user.org_id
            ? assignmentsQuery.or(`org_id.eq.${user.org_id},org_id.is.null`)
            : assignmentsQuery;
        const { data: assignments, error: assignmentsError } = await scopedAssignments;
        if (assignmentsError || !assignments || assignments.length === 0) {
            return cacheAndReturn(cacheKey, {
                role: canonicalRole,
                permissions: getFallbackPermissions(user),
            });
        }
        const roleIds = assignments
            .map((assignment) => assignment.role_id)
            .filter((roleId) => typeof roleId === 'string' && roleId.length > 0);
        if (roleIds.length === 0) {
            return cacheAndReturn(cacheKey, {
                role: canonicalRole,
                permissions: getFallbackPermissions(user),
            });
        }
        const { data: rolePermissions, error: rolePermissionsError } = await supabase_client_1.supabaseServer
            .from('role_permissions')
            .select('permission_id')
            .in('role_id', roleIds);
        if (rolePermissionsError || !rolePermissions || rolePermissions.length === 0) {
            return cacheAndReturn(cacheKey, {
                role: canonicalRole,
                permissions: getFallbackPermissions(user),
            });
        }
        const permissionIds = rolePermissions
            .map((row) => row.permission_id)
            .filter((permissionId) => typeof permissionId === 'string' && permissionId.length > 0);
        if (permissionIds.length === 0) {
            return cacheAndReturn(cacheKey, {
                role: canonicalRole,
                permissions: getFallbackPermissions(user),
            });
        }
        const { data: permissions, error: permissionsError } = await supabase_client_1.supabaseServer
            .from('permissions')
            .select('name')
            .in('id', permissionIds);
        if (permissionsError || !permissions || permissions.length === 0) {
            return cacheAndReturn(cacheKey, {
                role: canonicalRole,
                permissions: getFallbackPermissions(user),
            });
        }
        const tablePermissions = permissions
            .map((row) => (0, rbac_constants_1.normalizePermission)(row.name))
            .filter((permission) => permission.length > 0);
        const overridesQuery = supabase_client_1.supabaseServer
            .from('user_permission_overrides')
            .select('permission_name, is_allowed')
            .eq('user_id', user.id);
        const scopedOverrides = user.org_id
            ? overridesQuery.or(`org_id.eq.${user.org_id},org_id.is.null`)
            : overridesQuery;
        const { data: overrides } = await scopedOverrides;
        const allowOverrides = [];
        const denyOverrides = [];
        for (const row of (overrides ?? [])) {
            if (!row || typeof row.permission_name !== 'string') {
                continue;
            }
            const normalized = (0, rbac_constants_1.normalizePermission)(row.permission_name);
            if (!normalized) {
                continue;
            }
            if (row.is_allowed === false) {
                denyOverrides.push(normalized);
            }
            else if (row.is_allowed === true) {
                allowOverrides.push(normalized);
            }
        }
        const merged = dedupePermissions([...tablePermissions, ...allowOverrides]);
        const deniedSet = new Set(denyOverrides);
        const effective = merged.filter((permission) => !deniedSet.has(permission));
        return cacheAndReturn(cacheKey, {
            role: canonicalRole,
            permissions: effective,
        });
    }
    catch {
        return cacheAndReturn(cacheKey, {
            role: canonicalRole,
            permissions: getFallbackPermissions(user),
        });
    }
}
async function hasPermission(user, requiredPermission) {
    const required = (0, rbac_constants_1.normalizePermission)(requiredPermission);
    if (!required) {
        return true;
    }
    const resolved = await resolveUserAuthorization(user);
    return resolved.permissions.includes('*') || resolved.permissions.includes(required);
}
