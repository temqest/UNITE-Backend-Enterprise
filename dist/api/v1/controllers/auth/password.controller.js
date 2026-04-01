"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.forgotPasswordController = forgotPasswordController;
exports.changePasswordController = changePasswordController;
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const auth_1 = require("../../validators/auth");
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
async function forgotPasswordController(req, res) {
    try {
        const validation = (0, auth_1.validateForgotPassword)(req.body ?? {});
        if (validation.error) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid forgot password payload.',
                details: validation.error.issues,
            });
            return;
        }
        const appUrl = process.env.FRONTEND_BASE_URL || process.env.APP_URL;
        await supabase_client_1.supabaseServer.auth.resetPasswordForEmail(validation.data.email, {
            redirectTo: appUrl ? `${appUrl.replace(/\/$/, '')}/login` : undefined,
        });
        // Return a generic success response to avoid exposing account existence.
        res.status(200).json({
            success: true,
            data: {
                message: 'If the email exists, a password reset link has been sent.',
            },
        });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'FORGOT_PASSWORD_FAILED',
            message: 'Failed to process forgot password request.',
            details: error,
        });
    }
}
async function changePasswordController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated user required.',
            });
            return;
        }
        const validation = (0, auth_1.validateChangePassword)(req.body ?? {});
        if (validation.error) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid change password payload.',
                details: validation.error.issues,
            });
            return;
        }
        const authUserId = req.user.auth_id ?? req.user.id;
        const updateResult = await supabase_client_1.supabaseServer.auth.admin.updateUserById(authUserId, {
            password: validation.data.newPassword,
            user_metadata: {
                force_password_change: false,
            },
        });
        if (updateResult.error) {
            sendError(res, 400, {
                code: 'CHANGE_PASSWORD_FAILED',
                message: 'Failed to update password.',
                details: updateResult.error,
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: {
                message: 'Password updated successfully.',
            },
        });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'CHANGE_PASSWORD_ERROR',
            message: 'Unexpected error while changing password.',
            details: error,
        });
    }
}
