"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshController = refreshController;
const http_session_service_1 = require("../../../../services/auth/http-session.service");
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
async function refreshController(req, res) {
    try {
        const result = await (0, http_session_service_1.refreshAppSessionFromRequest)(req);
        (0, http_session_service_1.setRefreshCookie)(res, result.refreshToken);
        res.status(200).json({ success: true, data: result.session });
    }
    catch (error) {
        const authError = error;
        (0, http_session_service_1.clearRefreshCookie)(res);
        sendError(res, 401, {
            code: authError.code ?? 'SESSION_EXPIRED',
            message: 'Your session expired. Please sign in again.',
            details: process.env.NODE_ENV === 'production' ? undefined : authError.details,
        });
    }
}
exports.default = refreshController;
