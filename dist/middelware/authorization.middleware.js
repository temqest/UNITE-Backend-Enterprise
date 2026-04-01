"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
        const authzService = await Promise.resolve().then(() => __importStar(require('../services/auth/authorization.service')));
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
