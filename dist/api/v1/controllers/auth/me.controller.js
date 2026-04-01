"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meController = meController;
const authorization_service_1 = require("../../../../services/auth/authorization.service");
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
async function meController(req, res) {
    try {
        if (!req.user?.id) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Authenticated user required.',
            });
            return;
        }
        const resolved = await (0, authorization_service_1.resolveUserAuthorization)(req.user);
        res.status(200).json({
            success: true,
            data: {
                id: req.user.id,
                role: resolved.role,
                org_id: req.user.org_id ?? null,
                active: req.user.is_active !== false,
                resolved_permissions_count: resolved.permissions.length,
                resolved_permissions: resolved.permissions,
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
