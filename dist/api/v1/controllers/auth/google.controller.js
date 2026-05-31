"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exchangeGoogleSessionController = exchangeGoogleSessionController;
exports.completeGoogleSignupController = completeGoogleSignupController;
const auth_1 = require("../../../../services/auth");
const http_session_service_1 = require("../../../../services/auth/http-session.service");
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
async function exchangeGoogleSessionController(req, res) {
    try {
        const body = req.body ?? {};
        const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
        const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : undefined;
        if (!accessToken) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'accessToken is required.',
            });
            return;
        }
        const result = await (0, auth_1.exchangeGoogleSession)({
            accessToken,
            refreshToken,
        });
        if (result.status === 'complete' && result.session.refreshToken) {
            const persistence = await (0, http_session_service_1.tryCreateAppRefreshSession)(result.session.user, result.session.refreshToken, result.session.accessToken, (0, http_session_service_1.getRequestSessionMetadata)(req));
            if (persistence.ok) {
                (0, http_session_service_1.setRefreshCookie)(res, result.session.refreshToken);
            }
            res.status(200).json({
                success: true,
                data: {
                    ...result,
                    session: (0, http_session_service_1.stripRefreshToken)(result.session),
                    ...(persistence.warning ? { refreshWarning: persistence.warning } : {}),
                },
            });
            return;
        }
        res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        const err = error;
        const code = err.code ?? 'GOOGLE_EXCHANGE_FAILED';
        const statusCode = code === 'INVALID_CREDENTIALS' ? 401 : 400;
        sendError(res, statusCode, {
            code,
            message: err.message ?? 'Failed to process Google authentication.',
            details: err.details,
        });
    }
}
async function completeGoogleSignupController(req, res) {
    try {
        const body = req.body ?? {};
        const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
        const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : undefined;
        const role = typeof body.role === 'string' ? body.role.trim().toLowerCase() : '';
        const firstName = typeof body.firstName === 'string' ? body.firstName : '';
        const lastName = typeof body.lastName === 'string' ? body.lastName : '';
        if (!accessToken) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'accessToken is required.',
            });
            return;
        }
        if (role !== 'admin' && role !== 'staff' && role !== 'donor') {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: "role must be 'admin', 'staff', or 'donor'.",
            });
            return;
        }
        const organization = isRecord(body.organization)
            ? {
                name: typeof body.organization.name === 'string' ? body.organization.name : '',
                code: typeof body.organization.code === 'string' ? body.organization.code : '',
            }
            : undefined;
        const orgCode = typeof body.org_code === 'string' ? body.org_code : undefined;
        const session = await (0, auth_1.completeGoogleSignup)({
            accessToken,
            refreshToken,
            role: role,
            firstName,
            lastName,
            blood_type: typeof body.blood_type === 'string' ? body.blood_type : undefined,
            phone_number: typeof body.phone_number === 'string' ? body.phone_number : undefined,
            province: typeof body.province === 'string' ? body.province : undefined,
            city: typeof body.city === 'string' ? body.city : undefined,
            organization,
            org_code: orgCode,
        });
        if (session.refreshToken) {
            const persistence = await (0, http_session_service_1.tryCreateAppRefreshSession)(session.user, session.refreshToken, session.accessToken, (0, http_session_service_1.getRequestSessionMetadata)(req));
            if (persistence.ok) {
                (0, http_session_service_1.setRefreshCookie)(res, session.refreshToken);
            }
            res.status(200).json({
                success: true,
                data: {
                    ...(0, http_session_service_1.stripRefreshToken)(session),
                    ...(persistence.warning ? { refreshWarning: persistence.warning } : {}),
                },
            });
            return;
        }
        res.status(200).json({ success: true, data: (0, http_session_service_1.stripRefreshToken)(session) });
    }
    catch (error) {
        const err = error;
        const code = err.code ?? 'GOOGLE_SIGNUP_COMPLETION_FAILED';
        const statusCode = code === 'INVALID_CREDENTIALS' ? 401 : 400;
        sendError(res, statusCode, {
            code,
            message: err.message ?? 'Failed to complete Google signup.',
            details: err.details,
        });
    }
}
