"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutController = logoutController;
const http_session_service_1 = require("../../../../services/auth/http-session.service");
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
async function logoutController(req, res) {
    try {
        await (0, http_session_service_1.revokeRefreshSessionFromRequest)(req, 'logout');
        await (0, http_session_service_1.revokeSupabaseSessionFromRequest)(req);
        (0, http_session_service_1.clearRefreshCookie)(res);
        res.status(200).json({
            success: true,
            data: {
                success: true,
                message: 'Logged out successfully',
            },
        });
    }
    catch (error) {
        const authError = error;
        (0, http_session_service_1.clearRefreshCookie)(res);
        sendError(res, 500, {
            code: authError.code ?? 'LOGOUT_FAILED',
            message: authError.message ?? 'Failed to logout.',
            details: authError.details,
        });
    }
}
