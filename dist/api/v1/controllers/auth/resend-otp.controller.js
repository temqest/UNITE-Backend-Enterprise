"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resendOtpController = resendOtpController;
const auth_1 = require("../../../../services/auth");
const auth_2 = require("../../validators/auth");
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
async function resendOtpController(req, res) {
    try {
        const validation = (0, auth_2.validateResendOtp)(req.body ?? {});
        if (validation.error) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid resend OTP payload.',
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
                message: 'authUserId is required to resend OTP.',
            });
            return;
        }
        const eligibility = await (0, auth_1.canResendVerificationCode)(validation.data.email, authUserId);
        if (!eligibility.canResend) {
            sendError(res, 429, {
                code: 'RESEND_RATE_LIMITED',
                message: eligibility.message,
                details: { nextAvailableAt: eligibility.nextAvailableAt },
            });
            return;
        }
        const firstName = validation.data.firstName ?? req.user?.first_name ?? 'User';
        const result = await (0, auth_1.sendVerificationCode)({
            email: validation.data.email,
            authUserId,
            firstName,
        });
        res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        const authError = error;
        sendError(res, 500, {
            code: authError.code ?? 'RESEND_OTP_ERROR',
            message: authError.message ?? 'Failed to resend verification code.',
            details: authError.details,
        });
    }
}
