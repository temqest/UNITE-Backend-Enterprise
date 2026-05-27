"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsWriteRateLimiter = exports.notificationsReadRateLimiter = exports.authOtpRateLimiter = exports.authLoginRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
function getEnvInt(name, fallback) {
    const raw = process.env[name];
    if (!raw) {
        return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function rateLimitErrorHandler(_req, res) {
    res.status(429).json({
        success: false,
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
        },
    });
}
// Skip rate limiting if we can't determine a client IP (failsafe for proxy issues)
function skipIfNoIp(req) {
    return !req.ip;
}
exports.authLoginRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: getEnvInt('AUTH_LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    max: getEnvInt('AUTH_LOGIN_RATE_LIMIT_MAX', 10),
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipIfNoIp,
    handler: rateLimitErrorHandler,
});
exports.authOtpRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: getEnvInt('AUTH_OTP_RATE_LIMIT_WINDOW_MS', 10 * 60 * 1000),
    max: getEnvInt('AUTH_OTP_RATE_LIMIT_MAX', 5),
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipIfNoIp,
    handler: rateLimitErrorHandler,
});
exports.notificationsReadRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: getEnvInt('NOTIFICATIONS_READ_RATE_LIMIT_WINDOW_MS', 60 * 1000),
    max: getEnvInt('NOTIFICATIONS_READ_RATE_LIMIT_MAX', 60),
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipIfNoIp,
    handler: rateLimitErrorHandler,
});
exports.notificationsWriteRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: getEnvInt('NOTIFICATIONS_WRITE_RATE_LIMIT_WINDOW_MS', 60 * 1000),
    max: getEnvInt('NOTIFICATIONS_WRITE_RATE_LIMIT_MAX', 20),
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipIfNoIp,
    handler: rateLimitErrorHandler,
});
