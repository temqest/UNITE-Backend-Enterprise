"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signupAdminController = signupAdminController;
exports.signupStaffController = signupStaffController;
exports.createStaffController = createStaffController;
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const user_service_1 = require("../../../../services/users/user.service");
const notification_service_1 = require("../../../../services/notifications/notification.service");
const users_1 = require("../../validators/users");
const userService = new user_service_1.UserService(supabase_client_1.supabaseServer, notification_service_1.notificationService);
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
function hasPermission(user, permission) {
    const roleType = user.role?.type ?? '';
    const permissions = user.role?.permissions ?? [];
    return roleType === 'super_admin' || permissions.includes('*') || permissions.includes(permission);
}
function isAdminLike(user) {
    const roleType = user.role?.type ?? '';
    return roleType === 'admin' || roleType === 'super_admin';
}
async function signupAdminController(req, res) {
    try {
        const body = req.body ?? {};
        const baseValidation = (0, users_1.validateSignup)(body);
        if (!baseValidation.success) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid admin signup payload.',
                details: baseValidation.error,
            });
            return;
        }
        const signupData = baseValidation.data;
        if (!signupData) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid admin signup payload.',
            });
            return;
        }
        const organization = body.organization;
        if (!organization?.name || !organization?.code) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'organization.name and organization.code are required.',
            });
            return;
        }
        const result = await userService.adminSignup({
            organization: {
                name: String(organization.name),
                code: String(organization.code),
                contact_email: typeof organization.contact_email === 'string' ? organization.contact_email : undefined,
                contact_phone: typeof organization.contact_phone === 'string' ? organization.contact_phone : undefined,
                metadata: organization.metadata && typeof organization.metadata === 'object' ? organization.metadata : undefined,
            },
            admin: {
                email: signupData.email,
                password: signupData.password,
                first_name: signupData.firstName,
                last_name: signupData.lastName,
            },
        });
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'ADMIN_SIGNUP_FAILED',
                message: result.error?.message ?? 'Failed to create admin account.',
                details: result.error?.details,
            });
            return;
        }
        res.status(201).json({ success: true, data: result.data });
    }
    catch (error) {
        const err = error;
        sendError(res, 500, {
            code: err.code ?? 'ADMIN_SIGNUP_ERROR',
            message: err.message ?? 'Unexpected error during admin signup.',
            details: err.details,
        });
    }
}
async function signupStaffController(req, res) {
    try {
        const body = req.body ?? {};
        const baseValidation = (0, users_1.validateSignup)(body);
        if (!baseValidation.success) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid staff signup payload.',
                details: baseValidation.error,
            });
            return;
        }
        const signupData = baseValidation.data;
        if (!signupData) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid staff signup payload.',
            });
            return;
        }
        const orgCodeRaw = body.org_code ?? body.organizationCode ?? body.invitation_code;
        if (typeof orgCodeRaw !== 'string' || orgCodeRaw.trim().length === 0) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'org_code (or organizationCode/invitation_code) is required for staff signup.',
            });
            return;
        }
        const result = await userService.staffSelfSignup({
            org_code: orgCodeRaw,
            email: signupData.email,
            password: signupData.password,
            first_name: signupData.firstName,
            last_name: signupData.lastName,
            geographic_area: body.geographic_area && typeof body.geographic_area === 'object'
                ? body.geographic_area
                : undefined,
        });
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'STAFF_SIGNUP_FAILED',
                message: result.error?.message ?? 'Failed to create staff account.',
                details: result.error?.details,
            });
            return;
        }
        res.status(201).json({ success: true, data: result.data });
    }
    catch (error) {
        const err = error;
        sendError(res, 500, {
            code: err.code ?? 'STAFF_SIGNUP_ERROR',
            message: err.message ?? 'Unexpected error during staff signup.',
            details: err.details,
        });
    }
}
async function createStaffController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated user required.',
            });
            return;
        }
        if (!isAdminLike(req.user) && !hasPermission(req.user, 'manage_users')) {
            sendError(res, 403, {
                code: 'FORBIDDEN',
                message: 'You do not have permission to create staff users.',
            });
            return;
        }
        const body = req.body ?? {};
        const baseValidation = (0, users_1.validateSignup)(body);
        if (!baseValidation.success) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid create staff payload.',
                details: baseValidation.error,
            });
            return;
        }
        const signupData = baseValidation.data;
        if (!signupData) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid create staff payload.',
            });
            return;
        }
        const roleType = typeof body.roleType === 'string' ? body.roleType : 'staff';
        const permissions = Array.isArray(body.permissions)
            ? body.permissions.filter((item) => typeof item === 'string')
            : [];
        const result = await userService.adminCreateStaff({
            requester_auth_id: req.user.auth_id ?? req.user.id,
            org_id: req.user.org_id ?? String(body.org_id ?? ''),
            email: signupData.email,
            first_name: signupData.firstName,
            last_name: signupData.lastName,
            role: {
                type: roleType,
                permissions,
            },
            send_invite_email: body.send_invite_email === true,
            temporary_password: typeof body.temporary_password === 'string' ? body.temporary_password : undefined,
        });
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'CREATE_STAFF_FAILED',
                message: result.error?.message ?? 'Failed to create staff user.',
                details: result.error?.details,
            });
            return;
        }
        res.status(201).json({ success: true, data: result.data });
    }
    catch (error) {
        const err = error;
        sendError(res, 500, {
            code: err.code ?? 'CREATE_STAFF_ERROR',
            message: err.message ?? 'Unexpected error while creating staff user.',
            details: err.details,
        });
    }
}
