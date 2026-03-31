import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  approveEventController,
  cancelEventController,
  rejectEventController,
  rescheduleEventController,
} from '../../controllers/events/approval.controller';
import {
  createEventController,
  deleteEventController,
  getEventsController,
  updateEventController,
} from '../../controllers/events/event.controller';
import {
  applyAsParticipantController,
  assignStaffController,
} from '../../controllers/events/participant.controller';
import { EventService } from '../../../../services/events/event.service';
import { supabaseServer } from '../../../../lib/supabase/supabase.client';
import type { EventActorContext } from '../../../../services/events/event.types';
import { authMiddleware } from '../../../../middelware/auth.middleware';
import { authorize, requireActiveUser, requireOrgScope } from '../../../../middelware/authorization.middleware';
import { validateMiddleware } from '../../../../middelware/validate.middleware';
import { asyncHandler } from '../../../../lib/async-handler';

interface UserRole {
  type?: string;
  permissions?: string[];
}

interface AuthenticatedUser {
  id: string;
  org_id?: string;
  role?: UserRole;
  geographic_area?: Record<string, unknown> | null;
  is_active?: boolean;
}

type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

const eventsRouter = Router();
const eventService = new EventService(supabaseServer);
const passthroughValidator = {
  validate: (payload: unknown) => ({ success: true as const, data: payload }),
};

const eventIdParamSchema = z.object({
  id: z.string().uuid({ message: 'id must be a valid UUID' }),
});

const eventsListQuerySchema = z.object({
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
  status: z.string().optional(),
  type: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  search: z.string().optional(),
  include_public: z.union([z.literal('true'), z.literal('false')]).optional(),
  include_archived: z.union([z.literal('true'), z.literal('false')]).optional(),
});

const paramsValidator = {
  validate: (payload: unknown) => {
    const parsed = eventIdParamSchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues };
    }
    return { success: true as const, data: parsed.data };
  },
};

const listQueryValidator = {
  validate: (payload: unknown) => {
    const parsed = eventsListQuerySchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues };
    }
    return { success: true as const, data: parsed.data };
  },
};

function toActor(user: AuthenticatedUser): EventActorContext {
  return {
    id: user.id,
    org_id: user.org_id ?? '',
    role: {
      type: user.role?.type ?? 'staff',
      permissions: user.role?.permissions ?? [],
    },
    geographic_area: user.geographic_area ?? null,
    is_active: user.is_active !== false,
  };
}

eventsRouter.post('/', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.create'), validateMiddleware(passthroughValidator), asyncHandler(createEventController as any));
eventsRouter.get('/', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.read'), validateMiddleware(listQueryValidator, 'query'), asyncHandler(getEventsController as any));
eventsRouter.get('/:id', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.read'), validateMiddleware(paramsValidator, 'params'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id || !req.user.org_id || req.user.is_active === false) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Active authenticated organization user required.',
        },
      });
      return;
    }

    const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await eventService.getEventById(eventId, toActor(req.user));
    if (result.error || !result.data) {
      res.status(404).json({
        success: false,
        error: {
          code: result.error?.code ?? 'EVENT_NOT_FOUND',
          message: result.error?.message ?? 'Event not found.',
          details: result.error?.details,
        },
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
});
eventsRouter.patch('/:id', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.update'), validateMiddleware(paramsValidator, 'params'), validateMiddleware(passthroughValidator), asyncHandler(updateEventController as any));
eventsRouter.delete('/:id', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.update'), validateMiddleware(paramsValidator, 'params'), asyncHandler(deleteEventController as any));

eventsRouter.post('/:id/approve', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.approve'), validateMiddleware(paramsValidator, 'params'), validateMiddleware(passthroughValidator), asyncHandler(approveEventController as any));
eventsRouter.post('/:id/reject', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.approve'), validateMiddleware(paramsValidator, 'params'), validateMiddleware(passthroughValidator), asyncHandler(rejectEventController as any));
eventsRouter.post('/:id/reschedule', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.update'), validateMiddleware(paramsValidator, 'params'), validateMiddleware(passthroughValidator), asyncHandler(rescheduleEventController as any));
eventsRouter.post('/:id/cancel', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.update'), validateMiddleware(paramsValidator, 'params'), validateMiddleware(passthroughValidator), asyncHandler(cancelEventController as any));
eventsRouter.post('/:id/staff', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.update'), validateMiddleware(paramsValidator, 'params'), validateMiddleware(passthroughValidator), asyncHandler(assignStaffController as any));
eventsRouter.post('/:id/apply', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.read'), validateMiddleware(paramsValidator, 'params'), validateMiddleware(passthroughValidator), asyncHandler(applyAsParticipantController as any));

export { eventsRouter };
export default eventsRouter;
