"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.donorSignupController = donorSignupController;
exports.getDonorDashboardController = getDonorDashboardController;
exports.getDonorProfileController = getDonorProfileController;
exports.updateDonorProfileController = updateDonorProfileController;
exports.activateDonorAccountController = activateDonorAccountController;
exports.listPublicDonorEventsController = listPublicDonorEventsController;
exports.applyDonorToEventController = applyDonorToEventController;
const donor_service_1 = require("../../../../services/users/donor.service");
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const donorService = new donor_service_1.DonorService(supabase_client_1.supabaseServer);
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
async function donorSignupController(req, res) {
    try {
        const body = req.body ?? {};
        const bloodTypeRaw = typeof body.blood_type === 'string'
            ? body.blood_type
            : (typeof body.bloodType === 'string' ? body.bloodType : undefined);
        const result = await donorService.donorSignup({
            email: String(body.email ?? ''),
            password: String(body.password ?? ''),
            first_name: String(body.firstName ?? body.first_name ?? ''),
            last_name: String(body.lastName ?? body.last_name ?? ''),
            blood_type: bloodTypeRaw ? bloodTypeRaw.toUpperCase() : undefined,
            phone_number: typeof body.phone_number === 'string'
                ? body.phone_number
                : (typeof body.phoneNumber === 'string' ? body.phoneNumber : undefined),
            province: typeof body.province === 'string' ? body.province : undefined,
            city: typeof body.city === 'string' ? body.city : undefined,
            org_code: typeof body.org_code === 'string'
                ? body.org_code
                : (typeof body.orgCode === 'string' ? body.orgCode : undefined),
        });
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'DONOR_SIGNUP_FAILED',
                message: result.error?.message ?? 'Failed to create donor signup.',
                details: result.error?.details,
            });
            return;
        }
        res.status(201).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'DONOR_SIGNUP_ERROR',
            message: 'Unexpected error during donor signup.',
            details: error,
        });
    }
}
async function getDonorDashboardController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active donor account is required.',
            });
            return;
        }
        const result = await donorService.getDonorDashboard(req.user.id);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'DONOR_DASHBOARD_FAILED',
                message: result.error?.message ?? 'Failed to load donor dashboard.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'DONOR_DASHBOARD_ERROR',
            message: 'Unexpected error while loading donor dashboard.',
            details: error,
        });
    }
}
async function getDonorProfileController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active donor account is required.',
            });
            return;
        }
        const result = await donorService.getDonorProfile(req.user.id);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'DONOR_PROFILE_FETCH_FAILED',
                message: result.error?.message ?? 'Failed to load donor profile.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'DONOR_PROFILE_FETCH_ERROR',
            message: 'Unexpected error while loading donor profile.',
            details: error,
        });
    }
}
async function updateDonorProfileController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active donor account is required.',
            });
            return;
        }
        const body = req.body ?? {};
        const result = await donorService.updateDonorProfile(req.user.id, {
            first_name: typeof body.first_name === 'string'
                ? body.first_name
                : (typeof body.firstName === 'string' ? body.firstName : undefined),
            last_name: typeof body.last_name === 'string'
                ? body.last_name
                : (typeof body.lastName === 'string' ? body.lastName : undefined),
            phone_number: typeof body.phone_number === 'string'
                ? body.phone_number
                : (typeof body.phoneNumber === 'string' ? body.phoneNumber : undefined),
            blood_type: typeof body.blood_type === 'string'
                ? body.blood_type.toUpperCase()
                : (typeof body.bloodType === 'string' ? body.bloodType.toUpperCase() : undefined),
            province: typeof body.province === 'string' ? body.province : undefined,
            city: typeof body.city === 'string' ? body.city : undefined,
            health_info: body.health_info && typeof body.health_info === 'object'
                ? body.health_info
                : (body.healthInfo && typeof body.healthInfo === 'object'
                    ? body.healthInfo
                    : undefined),
        });
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'DONOR_PROFILE_UPDATE_FAILED',
                message: result.error?.message ?? 'Failed to update donor profile.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'DONOR_PROFILE_UPDATE_ERROR',
            message: 'Unexpected error while updating donor profile.',
            details: error,
        });
    }
}
async function activateDonorAccountController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Authentication is required.',
            });
            return;
        }
        const body = req.body ?? {};
        const bloodTypeRaw = typeof body.blood_type === 'string'
            ? body.blood_type
            : (typeof body.bloodType === 'string' ? body.bloodType : undefined);
        const result = await donorService.activateDonorAccount({
            user_id: req.user.id,
            first_name: typeof body.first_name === 'string'
                ? body.first_name
                : (typeof body.firstName === 'string' ? body.firstName : undefined),
            last_name: typeof body.last_name === 'string'
                ? body.last_name
                : (typeof body.lastName === 'string' ? body.lastName : undefined),
            blood_type: bloodTypeRaw ? bloodTypeRaw.toUpperCase() : undefined,
            phone_number: typeof body.phone_number === 'string'
                ? body.phone_number
                : (typeof body.phoneNumber === 'string' ? body.phoneNumber : undefined),
            province: typeof body.province === 'string' ? body.province : undefined,
            city: typeof body.city === 'string' ? body.city : undefined,
        });
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'DONOR_ACTIVATION_FAILED',
                message: result.error?.message ?? 'Failed to activate donor account.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'DONOR_ACTIVATION_ERROR',
            message: 'Unexpected error while activating donor account.',
            details: error,
        });
    }
}
async function listPublicDonorEventsController(req, res) {
    try {
        const query = req.query ?? {};
        const result = await donorService.listPublicEvents({
            from_date: typeof query.from_date === 'string' ? query.from_date : undefined,
            to_date: typeof query.to_date === 'string' ? query.to_date : undefined,
            type: typeof query.type === 'string' ? query.type : undefined,
            province: typeof query.province === 'string' ? query.province : undefined,
            city: typeof query.city === 'string' ? query.city : undefined,
            limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
            offset: typeof query.offset === 'string' ? Number(query.offset) : undefined,
        });
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'DONOR_PUBLIC_EVENTS_FAILED',
                message: result.error?.message ?? 'Failed to load donor events.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'DONOR_PUBLIC_EVENTS_ERROR',
            message: 'Unexpected error while loading donor events.',
            details: error,
        });
    }
}
async function applyDonorToEventController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active donor account is required.',
            });
            return;
        }
        const eventId = req.params?.id ?? req.params?.eventId;
        if (!eventId) {
            sendError(res, 400, {
                code: 'EVENT_ID_REQUIRED',
                message: 'Event id is required.',
            });
            return;
        }
        const result = await donorService.applyToEventAsDonor(req.user.id, eventId);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'DONOR_EVENT_APPLY_FAILED',
                message: result.error?.message ?? 'Failed to apply donor to event.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'DONOR_EVENT_APPLY_ERROR',
            message: 'Unexpected error while applying donor to event.',
            details: error,
        });
    }
}
