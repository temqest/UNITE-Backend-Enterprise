"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listStaffController = listStaffController;
exports.createStaffManagementController = createStaffManagementController;
exports.updateStaffManagementController = updateStaffManagementController;
exports.deleteStaffManagementController = deleteStaffManagementController;
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const user_service_1 = require("../../../../services/users/user.service");
const notification_service_1 = require("../../../../services/notifications/notification.service");
const rbac_constants_1 = require("../../../../services/auth/rbac.constants");
const profile_picture_service_1 = require("../../../../services/users/profile-picture.service");
const userService = new user_service_1.UserService(supabase_client_1.supabaseServer, notification_service_1.notificationService);
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
function isAdminLike(user) {
    const roleType = user.role?.type ?? '';
    return roleType === 'admin' || roleType === 'super_admin';
}
function hasManageUsersPermission(user) {
    const permissions = user.role?.permissions ?? [];
    return permissions.includes('*') || permissions.includes('users.invite') || permissions.includes('manage_staff');
}
function normalizeOptionalText(value) {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function buildRoleFromInput(roleTypeRaw) {
    const roleType = roleTypeRaw.trim();
    const canonical = (0, rbac_constants_1.resolveCanonicalRole)(roleType);
    const defaultPermissions = rbac_constants_1.ROLE_DEFAULT_PERMISSIONS[canonical] ?? [];
    if (roleType === canonical || roleType === 'super_admin') {
        return {
            type: roleType,
            permissions: [...defaultPermissions],
        };
    }
    return {
        type: roleType,
        permissions: [],
    };
}
function toGeographicAreaObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return { ...value };
}
function hasOwnKeys(value) {
    return Object.keys(value).length > 0;
}
function shapeStaffResponse(user) {
    const geographic = toGeographicAreaObject(user.geographic_area);
    const resolvedRole = typeof user.role === 'string'
        ? user.role
        : typeof user.role === 'object' && user.role
            ? String(user.role.type ?? '')
            : '';
    return {
        ...user,
        role: resolvedRole || null,
        status: user.is_active === true ? 'active' : 'pending',
        sector: geographic.sector ?? null,
        province: geographic.province ?? null,
        district: geographic.district ?? null,
        municipality: geographic.municipality ?? null,
    };
}
async function listStaffController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated user with organization scope required.',
            });
            return;
        }
        const roleFilter = normalizeOptionalText(req.query?.role);
        const search = normalizeOptionalText(req.query?.search);
        let query = supabase_client_1.supabaseServer
            .from('users')
            .select('*')
            .eq('org_id', req.user.org_id)
            .neq('id', req.user.id)
            .order('created_at', { ascending: false });
        if (roleFilter) {
            query = query.eq('role->>type', roleFilter);
        }
        if (req.user.role?.type !== 'super_admin') {
            query = query.neq('role->>type', 'super_admin');
        }
        if (search) {
            const escaped = search.replace(/[%_]/g, '\\$&');
            query = query.or(`first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,email.ilike.%${escaped}%`);
        }
        const { data, error } = await query;
        if (error) {
            sendError(res, 400, {
                code: 'STAFF_LIST_FAILED',
                message: 'Failed to list staff users.',
                details: error,
            });
            return;
        }
        const users = Array.isArray(data) ? data.map((user) => shapeStaffResponse(user)) : [];
        const usersWithUrls = await (0, profile_picture_service_1.attachSignedProfileUrls)(users);
        res.status(200).json({ success: true, data: usersWithUrls });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'STAFF_LIST_ERROR',
            message: 'Unexpected error while listing staff users.',
            details: error,
        });
    }
}
async function createStaffManagementController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated user with organization scope required.',
            });
            return;
        }
        if (!isAdminLike(req.user) && !hasManageUsersPermission(req.user)) {
            sendError(res, 403, {
                code: 'FORBIDDEN',
                message: 'You do not have permission to create staff users.',
            });
            return;
        }
        const body = req.body ?? {};
        const options = Array.isArray(body.options)
            ? body.options.filter((item) => typeof item === 'string')
            : [];
        const shouldSpecifyLocation = options.includes('specify_location');
        const geographicArea = {
            sector: normalizeOptionalText(body.sector) ?? 'none',
            options,
        };
        if (shouldSpecifyLocation) {
            const incomingDesignations = body.geographic_designations;
            if (Array.isArray(incomingDesignations) && incomingDesignations.length > 0) {
                geographicArea.assigned_areas = incomingDesignations;
            }
        }
        const roleType = normalizeOptionalText(body.role);
        if (!roleType) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Role is required.',
            });
            return;
        }
        const result = await userService.adminCreateStaff({
            requester_auth_id: req.user.auth_id ?? req.user.id,
            org_id: req.user.org_id,
            email: String(body.email ?? ''),
            first_name: String(body.first_name ?? ''),
            last_name: String(body.last_name ?? ''),
            role: buildRoleFromInput(roleType),
            geographic_area: hasOwnKeys(geographicArea) ? geographicArea : null,
            send_invite_email: false,
            temporary_password: String(body.password ?? ''),
        });
        if (result.error || !result.data?.user) {
            sendError(res, 400, {
                code: result.error?.code ?? 'CREATE_STAFF_FAILED',
                message: result.error?.message ?? 'Failed to create staff user.',
                details: result.error?.details,
            });
            return;
        }
        if (body.force_password_change === true && result.data.auth_user_id) {
            await supabase_client_1.supabaseServer.auth.admin.updateUserById(result.data.auth_user_id, {
                user_metadata: {
                    force_password_change: true,
                },
            });
        }
        const finalUser = await (0, profile_picture_service_1.attachSignedProfileUrls)(shapeStaffResponse(result.data.user));
        res.status(201).json({ success: true, data: finalUser });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'CREATE_STAFF_ERROR',
            message: 'Unexpected error while creating staff user.',
            details: error,
        });
    }
}
async function updateStaffManagementController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated user with organization scope required.',
            });
            return;
        }
        const targetUserId = req.params?.id;
        if (!targetUserId) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'User id is required.',
            });
            return;
        }
        const existingQuery = supabase_client_1.supabaseServer.from('users').select('*').eq('id', targetUserId).maybeSingle();
        const { data: existingUserRaw, error: existingError } = await existingQuery;
        const existingUser = existingUserRaw;
        if (existingError || !existingUser) {
            sendError(res, 404, {
                code: 'USER_NOT_FOUND',
                message: 'Staff user not found.',
                details: existingError,
            });
            return;
        }
        // Implement granular edit permissions
        const actorRole = req.user.role?.type || '';
        const targetRoleObj = typeof existingUser.role === 'string' ? existingUser.role : existingUser.role?.type;
        const targetRole = String(targetRoleObj || '');
        const isSelf = targetUserId === req.user.id;
        if (targetRole === 'super_admin') {
            if (!isSelf) {
                sendError(res, 403, { code: 'PROTECTED_SUPER_ADMIN', message: 'You do not have permission to modify a super admin account.' });
                return;
            }
        }
        else {
            let allowed = false;
            if (isSelf)
                allowed = true;
            else if (actorRole === 'super_admin')
                allowed = true;
            else if (actorRole === 'admin')
                allowed = targetRole !== 'admin' && targetRole !== 'super_admin';
            else if (actorRole === 'coordinator')
                allowed = targetRole === 'stakeholder';
            if (!allowed) {
                sendError(res, 403, { code: 'FORBIDDEN', message: 'You do not have permission to update this user.' });
                return;
            }
        }
        const body = req.body ?? {};
        const patch = {};
        const firstName = normalizeOptionalText(body.first_name);
        if (firstName !== undefined) {
            patch.first_name = firstName;
        }
        const lastName = normalizeOptionalText(body.last_name);
        if (lastName !== undefined) {
            patch.last_name = lastName;
        }
        const incomingEmail = normalizeOptionalText(body.email);
        if (incomingEmail !== undefined && incomingEmail.toLowerCase() !== String(existingUser.email).toLowerCase()) {
            const authId = String(existingUser.auth_id ?? '');
            if (!authId) {
                sendError(res, 400, {
                    code: 'USER_UPDATE_FAILED',
                    message: 'Target user is missing auth_id and cannot update email.',
                });
                return;
            }
            const authResult = await supabase_client_1.supabaseServer.auth.admin.updateUserById(authId, {
                email: incomingEmail.toLowerCase(),
            });
            if (authResult.error) {
                sendError(res, 400, {
                    code: 'AUTH_EMAIL_UPDATE_FAILED',
                    message: 'Failed to update auth email.',
                    details: authResult.error,
                });
                return;
            }
            patch.email = incomingEmail.toLowerCase();
        }
        const incomingRole = normalizeOptionalText(body.role);
        if (incomingRole !== undefined) {
            if (targetRole === 'super_admin') {
                sendError(res, 403, { code: 'CANNOT_MODIFY_SUPER_ADMIN_ROLE', message: 'Super admin role cannot be modified.' });
                return;
            }
            patch.role = buildRoleFromInput(incomingRole);
        }
        if (Object.prototype.hasOwnProperty.call(body, 'phone_number')) {
            patch.phone_number = normalizeOptionalText(body.phone_number) ?? null;
        }
        const geographic = toGeographicAreaObject(existingUser.geographic_area);
        let shouldPatchGeographic = false;
        const incomingSector = normalizeOptionalText(body.sector);
        if (incomingSector !== undefined) {
            geographic.sector = incomingSector;
            shouldPatchGeographic = true;
        }
        const incomingProvince = normalizeOptionalText(body.province);
        if (incomingProvince !== undefined) {
            geographic.province = incomingProvince;
            shouldPatchGeographic = true;
        }
        const incomingDistrict = normalizeOptionalText(body.district);
        if (incomingDistrict !== undefined) {
            geographic.district = incomingDistrict;
            shouldPatchGeographic = true;
        }
        const incomingMunicipality = normalizeOptionalText(body.municipality);
        if (incomingMunicipality !== undefined) {
            geographic.municipality = incomingMunicipality;
            shouldPatchGeographic = true;
        }
        const incomingArea = normalizeOptionalText(body.geographic_area);
        if (incomingArea !== undefined) {
            geographic.city = incomingArea;
            shouldPatchGeographic = true;
        }
        const incomingDesignations = body.geographic_designations;
        if (Array.isArray(incomingDesignations)) {
            geographic.assigned_areas = incomingDesignations;
            shouldPatchGeographic = true;
        }
        if (shouldPatchGeographic) {
            patch.geographic_area = hasOwnKeys(geographic) ? geographic : null;
        }
        if (Object.keys(patch).length === 0) {
            const finalUser = await (0, profile_picture_service_1.attachSignedProfileUrls)(shapeStaffResponse(existingUser));
            res.status(200).json({ success: true, data: finalUser });
            return;
        }
        const usersTable = supabase_client_1.supabaseServer.from('users');
        const { data: updatedRaw, error: updateError } = await usersTable
            .update(patch)
            .eq('id', targetUserId)
            .eq('org_id', req.user.org_id)
            .select('*')
            .single();
        const updated = updatedRaw;
        if (updateError || !updated) {
            sendError(res, 400, {
                code: 'USER_UPDATE_FAILED',
                message: 'Failed to update staff user.',
                details: updateError,
            });
            return;
        }
        const finalUser = await (0, profile_picture_service_1.attachSignedProfileUrls)(shapeStaffResponse(updated));
        res.status(200).json({ success: true, data: finalUser });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'USER_UPDATE_ERROR',
            message: 'Unexpected error while updating staff user.',
            details: error,
        });
    }
}
async function deleteStaffManagementController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated user with organization scope required.',
            });
            return;
        }
        const targetUserId = req.params?.id;
        if (!targetUserId) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'User id is required.',
            });
            return;
        }
        if (targetUserId === req.user.id) {
            sendError(res, 400, {
                code: 'INVALID_OPERATION',
                message: 'You cannot delete your own account.',
            });
            return;
        }
        const { data: targetUserRaw, error: targetError } = await supabase_client_1.supabaseServer
            .from('users')
            .select('id, auth_id, org_id, role')
            .eq('id', targetUserId)
            .eq('org_id', req.user.org_id)
            .maybeSingle();
        const targetUser = targetUserRaw;
        if (targetError || !targetUser) {
            sendError(res, 404, {
                code: 'USER_NOT_FOUND',
                message: 'Staff user not found.',
                details: targetError,
            });
            return;
        }
        const targetRoleObj = typeof targetUser.role === 'string' ? targetUser.role : targetUser.role?.type;
        const targetRole = String(targetRoleObj || '');
        if (targetRole === 'super_admin') {
            sendError(res, 403, { code: 'CANNOT_DELETE_SUPER_ADMIN', message: 'Super admin accounts cannot be deleted.' });
            return;
        }
        const authId = String(targetUser.auth_id ?? '');
        if (!authId) {
            sendError(res, 400, {
                code: 'USER_DELETE_FAILED',
                message: 'Target user is missing auth_id and cannot be deleted safely.',
            });
            return;
        }
        const authDelete = await supabase_client_1.supabaseServer.auth.admin.deleteUser(authId);
        if (authDelete.error) {
            sendError(res, 400, {
                code: 'AUTH_DELETE_FAILED',
                message: 'Failed to delete auth user.',
                details: authDelete.error,
            });
            return;
        }
        res.status(200).json({ success: true, data: null });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'USER_DELETE_ERROR',
            message: 'Unexpected error while deleting staff user.',
            details: error,
        });
    }
}
