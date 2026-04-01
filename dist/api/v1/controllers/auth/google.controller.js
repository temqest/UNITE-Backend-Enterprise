"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exchangeGoogleSessionController = exchangeGoogleSessionController;
exports.completeGoogleSignupController = completeGoogleSignupController;
const auth_1 = require("../../../../services/auth");
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
        if (role !== 'admin' && role !== 'staff') {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: "role must be either 'admin' or 'staff'.",
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
            role,
            firstName,
            lastName,
            organization,
            org_code: orgCode,
        });
        res.status(200).json({ success: true, data: session });
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
