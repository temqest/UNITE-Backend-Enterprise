"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireActiveUser = requireActiveUser;
exports.requireOrgScope = requireOrgScope;
exports.authorize = authorize;
function sendError(res, statusCode, code, message) {
    res.status(statusCode).json({
        success: false,
        error: {
            code,
            message,
        },
    });
}
function getRequestId(req) {
    const byHeader = req.headers['x-request-id'];
    if (typeof byHeader === 'string' && byHeader.trim().length > 0) {
        return byHeader;
    }
    return 'unknown';
}
function logDecision(req, decision) {
    const payload = {
        requestId: getRequestId(req),
        endpoint: `${req.method} ${req.originalUrl || req.url}`,
        ...decision,
    };
    const output = `[auth] ${JSON.stringify(payload)}`;
    if (payload.decision === 'deny') {
        console.warn(output);
        return;
    }
    console.info(output);
}
function requireActiveUser(req, res, next) {
    if (!req.user?.id) {
        logDecision(req, {
            userId: 'anonymous',
            role: 'unknown',
            orgId: 'none',
            decision: 'deny',
            reasonCode: 'UNAUTHORIZED',
        });
        sendError(res, 401, 'UNAUTHORIZED', 'Authenticated user required.');
        return;
    }
    if (req.user.is_active === false) {
        logDecision(req, {
            userId: req.user.id,
            role: req.user.role?.type ?? 'unknown',
            orgId: req.user.org_id ?? 'none',
            decision: 'deny',
            reasonCode: 'INACTIVE_USER',
        });
        sendError(res, 403, 'INACTIVE_USER', 'User account is inactive.');
        return;
    }
    next();
}
function requireOrgScope(req, res, next) {
    if (!req.user?.id) {
        logDecision(req, {
            userId: 'anonymous',
            role: 'unknown',
            orgId: 'none',
            decision: 'deny',
            reasonCode: 'UNAUTHORIZED',
        });
        sendError(res, 401, 'UNAUTHORIZED', 'Authenticated user required.');
        return;
    }
    if (!req.user.org_id) {
        logDecision(req, {
            userId: req.user.id,
            role: req.user.role?.type ?? 'unknown',
            orgId: 'none',
            decision: 'deny',
            reasonCode: 'FORBIDDEN_ORG_SCOPE_REQUIRED',
        });
        sendError(res, 403, 'FORBIDDEN_ORG_SCOPE_REQUIRED', 'Organization scope is required for this action.');
        return;
    }
    next();
}
function authorize(permission) {
    return async (req, res, next) => {
        if (!req.user?.id) {
            logDecision(req, {
                userId: 'anonymous',
                role: 'unknown',
                orgId: 'none',
                decision: 'deny',
                reasonCode: 'UNAUTHORIZED',
            });
            sendError(res, 401, 'UNAUTHORIZED', 'Authenticated user required.');
            return;
        }
        const user = req.user;
        const authzService = await import('../services/auth/authorization.service.js');
        const granted = await authzService.hasPermission(user, permission);
        if (!granted) {
            const authz = await authzService.resolveUserAuthorization(user);
            logDecision(req, {
                userId: user.id,
                role: authz.role,
                orgId: user.org_id ?? 'none',
                decision: 'deny',
                reasonCode: 'FORBIDDEN_PERMISSION_REQUIRED',
            });
            sendError(res, 403, 'FORBIDDEN', `Permission required: ${permission}`);
            return;
        }
        const authz = await authzService.resolveUserAuthorization(user);
        logDecision(req, {
            userId: user.id,
            role: authz.role,
            orgId: user.org_id ?? 'none',
            decision: 'allow',
            reasonCode: 'AUTHORIZED',
        });
        next();
    };
}
