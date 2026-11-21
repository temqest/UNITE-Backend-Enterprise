"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateMiddleware = validateMiddleware;
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
function validateMiddleware(validator, source = 'body') {
    return (req, res, next) => {
        try {
            const payload = source === 'query'
                ? (req.query ?? {})
                : source === 'params'
                    ? (req.params ?? {})
                    : (req.body ?? {});
            const result = validator.validate(payload);
            if (!result.success) {
                sendError(res, 400, {
                    code: 'VALIDATION_ERROR',
                    message: 'Request validation failed.',
                    details: result.error,
                });
                return;
            }
            if (source === 'query') {
                req.query = result.data;
            }
            else if (source === 'params') {
                req.params = result.data;
            }
            else {
                req.body = result.data;
            }
            next();
        }
        catch (error) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Request validation failed.',
                details: error,
            });
        }
    };
}
exports.default = validateMiddleware;
