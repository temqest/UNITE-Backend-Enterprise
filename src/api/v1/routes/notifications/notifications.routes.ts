import { Router } from 'express';
import { z } from 'zod';
import {
  getNotificationsController,
  getUnreadCountController,
  markNotificationReadController,
} from '../../controllers/notifications/notification.controller';
import { authMiddleware } from '../../../../middelware/auth.middleware';
import { requireActiveUser } from '../../../../middelware/authorization.middleware';
import {
  notificationsReadRateLimiter,
  notificationsWriteRateLimiter,
} from '../../../../middelware/rate-limit.middleware';
import { validateMiddleware } from '../../../../middelware/validate.middleware';
import { asyncHandler } from '../../../../lib/async-handler';

const notificationsRouter = Router();

const notificationsQuerySchema = z.object({
  include_read: z.union([z.literal('true'), z.literal('false')]).optional(),
  include_broadcast: z.union([z.literal('true'), z.literal('false')]).optional(),
  types: z.string().optional(),
  limit: z
    .string()
    .regex(/^\d+$/, { message: 'limit must be a positive integer string' })
    .transform((value) => Number.parseInt(value, 10))
    .refine((value) => value >= 1 && value <= 100, { message: 'limit must be between 1 and 100' })
    .optional(),
  offset: z
    .string()
    .regex(/^\d+$/, { message: 'offset must be a non-negative integer string' })
    .transform((value) => Number.parseInt(value, 10))
    .optional(),
});

const notificationIdParamSchema = z.object({
  id: z.string().uuid({ message: 'id must be a valid UUID' }),
});

const queryValidator = {
  validate: (payload: unknown) => {
    const parsed = notificationsQuerySchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues };
    }
    return { success: true as const, data: parsed.data };
  },
};

const paramsValidator = {
  validate: (payload: unknown) => {
    const parsed = notificationIdParamSchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues };
    }
    return { success: true as const, data: parsed.data };
  },
};

notificationsRouter.get(
  '/',
  authMiddleware,
  requireActiveUser,
  notificationsReadRateLimiter,
  validateMiddleware(queryValidator, 'query'),
  asyncHandler(getNotificationsController as any)
);

notificationsRouter.get(
  '/unread',
  authMiddleware,
  requireActiveUser,
  notificationsReadRateLimiter,
  asyncHandler(getUnreadCountController as any)
);

notificationsRouter.patch(
  '/:id/read',
  authMiddleware,
  requireActiveUser,
  notificationsWriteRateLimiter,
  validateMiddleware(paramsValidator, 'params'),
  asyncHandler(markNotificationReadController as any)
);

export { notificationsRouter };
export default notificationsRouter;
