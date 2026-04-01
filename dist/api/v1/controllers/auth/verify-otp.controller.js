"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyOtpController = verifyOtpController;
const auth_1 = require("../../../../services/auth");
const auth_2 = require("../../validators/auth");
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
async function verifyOtpController(req, res) {
    try {
        const validation = (0, auth_2.validateVerifyOtp)(req.body ?? {});
        if (validation.error) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid OTP verification payload.',
                details: validation.error.issues,
            });
            return;
        }
        if (req.user && validation.data.authUserId && validation.data.authUserId !== (req.user.auth_id ?? req.user.id)) {
            sendError(res, 403, {
                code: 'AUTH_USER_ID_MISMATCH',
                message: 'authUserId does not match the authenticated user.',
            });
            return;
        }
        const authUserId = req.user?.auth_id ?? req.user?.id ?? validation.data.authUserId;
        if (!authUserId) {
            sendError(res, 400, {
                code: 'AUTH_USER_ID_REQUIRED',
                message: 'authUserId is required for OTP verification.',
            });
            return;
        }
        const result = await (0, auth_1.verifySignupOtp)({
            email: validation.data.email,
            code: validation.data.code,
            authUserId,
        });
        if (!result.success) {
            sendError(res, 400, {
                code: 'OTP_VERIFICATION_FAILED',
                message: result.message,
                details: { remainingAttempts: result.remainingAttempts },
            });
            return;
        }
        res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        const authError = error;
        sendError(res, 500, {
            code: authError.code ?? 'OTP_VERIFICATION_ERROR',
            message: authError.message ?? 'Failed to verify OTP.',
            details: authError.details,
        });
    }
}
