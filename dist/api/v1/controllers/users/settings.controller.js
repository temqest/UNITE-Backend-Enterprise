"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrganizationSettingsController = getOrganizationSettingsController;
exports.updateOrganizationSettingsController = updateOrganizationSettingsController;
exports.getUserSettingsController = getUserSettingsController;
exports.updateUserSettingsController = updateUserSettingsController;
const zod_1 = require("zod");
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const organization_settings_service_1 = require("../../../../services/settings/organization-settings.service");
const user_settings_service_1 = require("../../../../services/settings/user-settings.service");
const users_1 = require("../../validators/users");
const orgSettingsService = new organization_settings_service_1.OrganizationSettingsService(supabase_client_1.supabaseServer);
const userSettingsService = new user_settings_service_1.UserSettingsService(supabase_client_1.supabaseServer);
const orgSettingsUpdateValidator = {
    validate: (payload) => zod_1.z
        .object({
        max_blood_bags_per_day: zod_1.z.number().int().positive().optional(),
        max_events_per_day: zod_1.z.number().int().positive().optional(),
        event_request_advance_days: zod_1.z.number().int().nonnegative().optional(),
        prevent_double_booking_same_day: zod_1.z.boolean().optional(),
        allow_weekend_events: zod_1.z.boolean().optional(),
        banned_days_of_week: zod_1.z.array(zod_1.z.number().int().min(0).max(6)).optional(),
        banned_specific_dates: zod_1.z.array(zod_1.z.string()).optional(),
        config: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    })
        .safeParse(payload),
};
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
function hasPermission(user, permission) {
    const roleType = user.role?.type ?? '';
    const permissions = user.role?.permissions ?? [];
    return (roleType === 'super_admin' ||
        permissions.includes('*') ||
        permissions.includes(permission));
}
function canReadOrgSettings(user) {
    const roleType = user.role?.type ?? '';
    return (roleType === 'super_admin' ||
        roleType === 'admin' ||
        hasPermission(user, 'settings.read') ||
        hasPermission(user, 'settings.update') ||
        hasPermission(user, 'manage_org_settings'));
}
function canManageOrgSettings(user) {
    const roleType = user.role?.type ?? '';
    return (roleType === 'super_admin' ||
        roleType === 'admin' ||
        hasPermission(user, 'settings.update') ||
        hasPermission(user, 'manage_org_settings'));
}
function asBoolean(value) {
    return typeof value === 'boolean' ? value : undefined;
}
function asString(value) {
    return typeof value === 'string' ? value : undefined;
}
function asDigestFrequency(value) {
    if (value !== 'daily' && value !== 'weekly' && value !== 'monthly' && value !== 'never') {
        return undefined;
    }
    return value;
}
function buildUserSettingsPatch(payload) {
    const enableEmail = false;
    const enableInApp = asBoolean(payload.enableInApp) ?? asBoolean(payload.enable_in_app_notifications);
    const enableAll = asBoolean(payload.enableAll) ?? asBoolean(payload.enable_all_notifications);
    const enableSms = asBoolean(payload.enableSms) ?? asBoolean(payload.enable_sms_notifications);
    const enablePush = asBoolean(payload.enablePushNotifications) ?? asBoolean(payload.enable_push_notifications);
    const enableEventNotifications = asBoolean(payload.enableEventNotifications) ?? asBoolean(payload.enable_event_notifications);
    const enableOrgUpdates = asBoolean(payload.enableOrgUpdates) ?? asBoolean(payload.enable_org_updates);
    const emailDigestFrequency = asDigestFrequency(payload.emailDigestFrequency) ?? asDigestFrequency(payload.email_digest_frequency);
    const timezone = asString(payload.timezone);
    const language = asString(payload.language);
    const preferences = {
        enableSms,
        enablePushNotifications: enablePush,
        enableEventNotifications,
        enableOrgUpdates,
        emailDigestFrequency,
        timezone,
        language,
    };
    const hasAnyPreference = Object.values(preferences).some((value) => value !== undefined);
    const computedEnableAll = enableAll ??
        (enableInApp !== undefined
            ? Boolean(enableInApp)
            : undefined);
    return {
        enable_email_notifications: enableEmail,
        enable_in_app_notifications: enableInApp,
        enable_all_notifications: computedEnableAll,
        preferences: hasAnyPreference ? preferences : undefined,
    };
}
async function getOrganizationSettingsController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated organization user required.',
            });
            return;
        }
        if (!canReadOrgSettings(req.user)) {
            sendError(res, 403, {
                code: 'FORBIDDEN',
                message: 'You do not have permission to view organization settings.',
            });
            return;
        }
        const result = await orgSettingsService.getSettings(req.user.org_id);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'ORG_SETTINGS_FETCH_FAILED',
                message: result.error?.message ?? 'Failed to fetch organization settings.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'ORG_SETTINGS_FETCH_ERROR',
            message: 'Unexpected error while fetching organization settings.',
            details: error,
        });
    }
}
async function updateOrganizationSettingsController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated organization user required.',
            });
            return;
        }
        if (!canManageOrgSettings(req.user)) {
            sendError(res, 403, {
                code: 'FORBIDDEN',
                message: 'You do not have permission to update organization settings.',
            });
            return;
        }
        const parsed = orgSettingsUpdateValidator.validate(req.body ?? {});
        if (!parsed.success) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid organization settings payload.',
                details: parsed.error.issues,
            });
            return;
        }
        const result = await orgSettingsService.updateSettings(req.user.org_id, parsed.data, req.user.id);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'ORG_SETTINGS_UPDATE_FAILED',
                message: result.error?.message ?? 'Failed to update organization settings.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'ORG_SETTINGS_UPDATE_ERROR',
            message: 'Unexpected error while updating organization settings.',
            details: error,
        });
    }
}
async function getUserSettingsController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated organization user required.',
            });
            return;
        }
        const targetUserId = req.params?.userId ?? req.user.id;
        if (targetUserId !== req.user.id && !canManageOrgSettings(req.user)) {
            sendError(res, 403, {
                code: 'FORBIDDEN',
                message: 'You do not have permission to access settings for this user.',
            });
            return;
        }
        const result = await userSettingsService.getSettingsByOrgAndUser(req.user.org_id, targetUserId);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'USER_SETTINGS_FETCH_FAILED',
                message: result.error?.message ?? 'Failed to fetch user settings.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'USER_SETTINGS_FETCH_ERROR',
            message: 'Unexpected error while fetching user settings.',
            details: error,
        });
    }
}
async function updateUserSettingsController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated user required.',
            });
            return;
        }
        const validation = (0, users_1.validateSettingsUpdate)(req.body ?? {});
        if (!validation.success) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid user settings payload.',
                details: validation.error,
            });
            return;
        }
        const settingsData = validation.data;
        if (!settingsData) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid user settings payload.',
            });
            return;
        }
        const targetUserId = req.params?.userId ?? req.user.id;
        if (targetUserId !== req.user.id && !canManageOrgSettings(req.user)) {
            sendError(res, 403, {
                code: 'FORBIDDEN',
                message: 'You do not have permission to update settings for this user.',
            });
            return;
        }
        const patch = buildUserSettingsPatch(settingsData);
        const result = await userSettingsService.updateSettings(targetUserId, patch);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'USER_SETTINGS_UPDATE_FAILED',
                message: result.error?.message ?? 'Failed to update user settings.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'USER_SETTINGS_UPDATE_ERROR',
            message: 'Unexpected error while updating user settings.',
            details: error,
        });
    }
}
