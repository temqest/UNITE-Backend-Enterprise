"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const notification_controller_1 = require("../../controllers/notifications/notification.controller");
const auth_middleware_1 = require("../../../../middelware/auth.middleware");
const authorization_middleware_1 = require("../../../../middelware/authorization.middleware");
const rate_limit_middleware_1 = require("../../../../middelware/rate-limit.middleware");
const validate_middleware_1 = require("../../../../middelware/validate.middleware");
const async_handler_1 = require("../../../../lib/async-handler");
const notificationsRouter = (0, express_1.Router)();
exports.notificationsRouter = notificationsRouter;
const notificationsQuerySchema = zod_1.z.object({
    include_read: zod_1.z.union([zod_1.z.literal('true'), zod_1.z.literal('false')]).optional(),
    include_broadcast: zod_1.z.union([zod_1.z.literal('true'), zod_1.z.literal('false')]).optional(),
    types: zod_1.z.string().optional(),
    limit: zod_1.z
        .string()
        .regex(/^\d+$/, { message: 'limit must be a positive integer string' })
        .transform((value) => Number.parseInt(value, 10))
        .refine((value) => value >= 1 && value <= 100, { message: 'limit must be between 1 and 100' })
        .optional(),
    offset: zod_1.z
        .string()
        .regex(/^\d+$/, { message: 'offset must be a non-negative integer string' })
        .transform((value) => Number.parseInt(value, 10))
        .optional(),
});
const notificationIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().uuid({ message: 'id must be a valid UUID' }),
});
const queryValidator = {
    validate: (payload) => {
        const parsed = notificationsQuerySchema.safeParse(payload);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues };
        }
        return { success: true, data: parsed.data };
    },
};
const paramsValidator = {
    validate: (payload) => {
        const parsed = notificationIdParamSchema.safeParse(payload);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues };
        }
        return { success: true, data: parsed.data };
    },
};
notificationsRouter.get('/', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, rate_limit_middleware_1.notificationsReadRateLimiter, (0, validate_middleware_1.validateMiddleware)(queryValidator, 'query'), (0, async_handler_1.asyncHandler)(notification_controller_1.getNotificationsController));
notificationsRouter.get('/unread', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, rate_limit_middleware_1.notificationsReadRateLimiter, (0, async_handler_1.asyncHandler)(notification_controller_1.getUnreadCountController));
notificationsRouter.patch('/:id/read', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, rate_limit_middleware_1.notificationsWriteRateLimiter, (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, async_handler_1.asyncHandler)(notification_controller_1.markNotificationReadController));
exports.default = notificationsRouter;
