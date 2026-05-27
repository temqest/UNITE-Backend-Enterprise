"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meController = meController;
const session_service_1 = require("../../../../services/auth/session.service");
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
async function meController(req, res) {
    try {
        const authHeader = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
        const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
        if (!req.user?.id || !accessToken) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Authenticated user required.',
            });
            return;
        }
        const session = await (0, session_service_1.validateSession)(accessToken);
        if (!session.isValid || !session.user) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Session is no longer valid.',
                details: session.reason,
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: {
                user: session.user,
                organization: session.organization,
                accessToken,
                redirectTo: String(session.user.role?.type ?? '').toLowerCase() === 'donor'
                    ? '/donor/dashboard'
                    : '/dashboard',
            },
        });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'AUTH_DIAGNOSTICS_ERROR',
            message: 'Failed to resolve auth diagnostics.',
            details: process.env.NODE_ENV === 'production' ? undefined : error,
        });
    }
}
exports.default = meController;
