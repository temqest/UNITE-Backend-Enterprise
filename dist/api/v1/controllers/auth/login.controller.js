"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginController = loginController;
const auth_1 = require("../../../../services/auth");
const auth_2 = require("../../validators/auth");
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
async function loginController(req, res) {
    try {
        const validation = (0, auth_2.validateLogin)(req.body ?? {});
        if (validation.error) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid login payload.',
                details: validation.error.issues,
            });
            return;
        }
        const result = await (0, auth_1.loginWithEmailPassword)(validation.data);
        res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        const authError = error;
        sendError(res, 401, {
            code: authError.code ?? 'LOGIN_FAILED',
            message: authError.message ?? 'Failed to login.',
            details: authError.details,
        });
    }
}
