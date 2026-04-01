"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutController = logoutController;
const auth_1 = require("../../../../services/auth");
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
async function logoutController(req, res) {
    try {
        if (!req.user?.id) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Authentication required.',
            });
            return;
        }
        if (req.user.is_active === false) {
            sendError(res, 403, {
                code: 'INACTIVE_USER',
                message: 'Inactive users cannot perform logout actions.',
            });
            return;
        }
        const result = await (0, auth_1.logout)();
        res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        const authError = error;
        sendError(res, 500, {
            code: authError.code ?? 'LOGOUT_FAILED',
            message: authError.message ?? 'Failed to logout.',
            details: authError.details,
        });
    }
}
