"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLoggerMiddleware = void 0;
const pino_http_1 = __importDefault(require("pino-http"));
const logger_1 = require("../utils/logger");
const SLOW_REQUEST_THRESHOLD_MS = 1000; // 1 second
exports.requestLoggerMiddleware = (0, pino_http_1.default)({
    logger: logger_1.requestLogger,
    // Custom properties to extract from the request
    customProps: (req, res) => {
        return {
            // Include user and org details if auth middleware has run
            userId: req.user?.id || 'unauthenticated',
            orgId: req.user?.org_id || 'unknown',
        };
    },
    // Filter out noisy paths like health checks from normal info logs
    autoLogging: {
        ignore: (req) => {
            // Only ignore successful health checks to keep logs clean
            if (req.url?.startsWith('/api/v1/system/health')) {
                return true;
            }
            return false;
        }
    },
    // Custom log levels based on status and response time
    customLogLevel: (req, res, err) => {
        if (res.statusCode >= 500 || err)
            return 'error';
        if (res.statusCode >= 400)
            return 'warn';
        // Log as 'warn' if the request was unusually slow, to highlight performance issues
        // Note: pino-http tracks response time internally, we can't easily access it here before it logs,
        // but pino-http automatically logs responseTime.
        return 'info';
    },
    // Format the success message
    customSuccessMessage: (req, res, responseTime) => {
        const isSlow = responseTime > SLOW_REQUEST_THRESHOLD_MS;
        const slowWarning = isSlow ? ` [SLOW: ${responseTime}ms]` : '';
        return `${req.method} ${req.url} completed with status ${res.statusCode} in ${responseTime}ms${slowWarning}`;
    },
    // Format the error message
    customErrorMessage: (req, res, err) => {
        return `${req.method} ${req.url} failed with status ${res.statusCode}: ${err.message}`;
    },
    // Sanitize sensitive headers and body fields (like passwords/tokens)
    serializers: {
        req: (req) => {
            // Create a copy of the request to manipulate
            const _req = {
                id: req.id,
                method: req.method,
                url: req.url,
                query: req.query,
                headers: { ...req.headers },
                remoteAddress: req.remoteAddress,
            };
            // Redact sensitive headers
            if (_req.headers.authorization)
                _req.headers.authorization = '[REDACTED]';
            if (_req.headers.cookie)
                _req.headers.cookie = '[REDACTED]';
            return _req;
        },
        res: (res) => {
            return {
                statusCode: res.statusCode,
            };
        },
        err: pino_http_1.default.stdSerializers.err,
    },
});
