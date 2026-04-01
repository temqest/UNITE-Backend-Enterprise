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
exports.authMiddleware = void 0;
exports.createAuthMiddleware = createAuthMiddleware;
const rbac_constants_1 = require("../services/auth/rbac.constants");
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
function getRequestId(req) {
    const header = req.headers['x-request-id'];
    return typeof header === 'string' && header.trim().length > 0 ? header : 'unknown';
}
function logAuthDecision(req, decision, reasonCode, userId, role, orgId) {
    const payload = {
        requestId: getRequestId(req),
        userId,
        role,
        orgId,
        endpoint: `${req.method} ${req.originalUrl || req.url}`,
        decision,
        reasonCode,
    };
    const output = `[auth] ${JSON.stringify(payload)}`;
    if (decision === 'deny') {
        console.warn(output);
        return;
    }
    console.info(output);
}
async function defaultGetUserFromRequest(authHeader) {
    const authService = await Promise.resolve().then(() => __importStar(require('../services/auth/session.service')));
    return authService.getUserFromRequest(authHeader);
}
function createAuthMiddleware(getUserFromRequestFn = defaultGetUserFromRequest) {
    return async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                logAuthDecision(req, 'deny', 'MISSING_TOKEN', 'anonymous', 'unknown', 'none');
                sendError(res, 401, {
                    code: 'MISSING_TOKEN',
                    message: 'Authorization token is required.',
                });
                return;
            }
            const user = await getUserFromRequestFn(authHeader);
            if (!user) {
                logAuthDecision(req, 'deny', 'UNAUTHORIZED', 'anonymous', 'unknown', 'none');
                sendError(res, 401, {
                    code: 'UNAUTHORIZED',
                    message: 'User not authenticated.',
                });
                return;
            }
            const roleType = user.role?.type;
            req.user = {
                id: user.id,
                auth_id: user.auth_id ?? user.id,
                org_id: user.org_id,
                is_active: user.is_active,
                canonical_role: (0, rbac_constants_1.resolveCanonicalRole)(roleType),
                role: user.role,
            };
            logAuthDecision(req, 'allow', 'AUTHENTICATED', req.user.id, req.user.canonical_role ?? 'unknown', req.user.org_id ?? 'none');
            next();
        }
        catch (error) {
            const errorCode = typeof error === 'object' && error !== null && 'code' in error
                ? String(error.code)
                : '';
            if (errorCode === 'UNKNOWN_ERROR') {
                logAuthDecision(req, 'deny', 'UNAUTHORIZED', 'anonymous', 'unknown', 'none');
                sendError(res, 401, {
                    code: 'UNAUTHORIZED',
                    message: 'User profile is missing or account setup is incomplete.',
                });
                return;
            }
            sendError(res, 500, {
                code: 'AUTH_ERROR',
                message: 'Authentication error occurred.',
                details: process.env.NODE_ENV === 'production' ? undefined : error,
            });
        }
    };
}
exports.authMiddleware = createAuthMiddleware();
exports.default = exports.authMiddleware;
