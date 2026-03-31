import { z } from 'zod';
import { EventApprovalService } from '../../../../services/events/approval.service';
import { EventService } from '../../../../services/events/event.service';
import type { EventActorContext } from '../../../../services/events/event.types';
import { supabaseServer } from '../../../../lib/supabase/supabase.client';

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

interface Request {
  params?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  user?: AuthenticatedUser;
}

interface Response {
  status: (code: number) => Response;
  json: (body: unknown) => void;
}

interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

const eventApprovalService = new EventApprovalService(supabaseServer);
const eventService = new EventService(supabaseServer);

const approvalActionValidator = {
  validate: (payload: unknown) =>
    z
      .object({
        notes: z.string().optional().nullable(),
        proposed_event_date: z.string().date().optional(),
        proposed_start_time: z.string().optional(),
        proposed_end_time: z.string().optional(),
      })
      .safeParse(payload),
};

const cancelValidator = {
  validate: (payload: unknown) =>
    z
      .object({
        notes: z.string().optional().nullable(),
      })
      .safeParse(payload),
};

function sendError(res: Response, statusCode: number, error: ApiError): void {
  res.status(statusCode).json({ success: false, error });
}

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

function getEventId(req: Request): string | null {
  const id = req.params?.eventId ?? req.params?.id;
  return id ?? null;
}

export async function approveEventController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated organization user required.',
      });
      return;
    }

    const eventId = getEventId(req);
    if (!eventId) {
      sendError(res, 400, {
        code: 'EVENT_ID_REQUIRED',
        message: 'eventId path parameter is required.',
      });
      return;
    }

    const parsed = approvalActionValidator.validate(req.body ?? {});
    if (!parsed.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid approve payload.',
        details: parsed.error.issues,
      });
      return;
    }

    const actor = toActor(req.user);
    const result = await eventApprovalService.reviewApproval(actor, {
      event_id: eventId,
      action: 'accept',
      notes: parsed.data.notes ?? undefined,
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'EVENT_APPROVAL_FAILED',
        message: result.error?.message ?? 'Failed to approve event.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'EVENT_APPROVAL_ERROR',
      message: 'Unexpected error while approving event.',
      details: error,
    });
  }
}

export async function rejectEventController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated organization user required.',
      });
      return;
    }

    const eventId = getEventId(req);
    if (!eventId) {
      sendError(res, 400, {
        code: 'EVENT_ID_REQUIRED',
        message: 'eventId path parameter is required.',
      });
      return;
    }

    const parsed = approvalActionValidator.validate(req.body ?? {});
    if (!parsed.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid reject payload.',
        details: parsed.error.issues,
      });
      return;
    }

    const actor = toActor(req.user);
    const result = await eventApprovalService.reviewApproval(actor, {
      event_id: eventId,
      action: 'reject',
      notes: parsed.data.notes ?? undefined,
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'EVENT_REJECTION_FAILED',
        message: result.error?.message ?? 'Failed to reject event.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'EVENT_REJECTION_ERROR',
      message: 'Unexpected error while rejecting event.',
      details: error,
    });
  }
}

export async function rescheduleEventController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated organization user required.',
      });
      return;
    }

    const eventId = getEventId(req);
    if (!eventId) {
      sendError(res, 400, {
        code: 'EVENT_ID_REQUIRED',
        message: 'eventId path parameter is required.',
      });
      return;
    }

    const parsed = approvalActionValidator.validate(req.body ?? {});
    if (!parsed.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid reschedule payload.',
        details: parsed.error.issues,
      });
      return;
    }

    if (!parsed.data.proposed_event_date || !parsed.data.proposed_start_time || !parsed.data.proposed_end_time) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'proposed_event_date, proposed_start_time, and proposed_end_time are required.',
      });
      return;
    }

    const actor = toActor(req.user);
    const result = await eventApprovalService.reviewApproval(actor, {
      event_id: eventId,
      action: 'reschedule',
      notes: parsed.data.notes ?? undefined,
      proposed_event_date: parsed.data.proposed_event_date,
      proposed_start_time: parsed.data.proposed_start_time,
      proposed_end_time: parsed.data.proposed_end_time,
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'EVENT_RESCHEDULE_FAILED',
        message: result.error?.message ?? 'Failed to reschedule event.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'EVENT_RESCHEDULE_ERROR',
      message: 'Unexpected error while rescheduling event.',
      details: error,
    });
  }
}

export async function cancelEventController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated organization user required.',
      });
      return;
    }

    const eventId = getEventId(req);
    if (!eventId) {
      sendError(res, 400, {
        code: 'EVENT_ID_REQUIRED',
        message: 'eventId path parameter is required.',
      });
      return;
    }

    const parsed = cancelValidator.validate(req.body ?? {});
    if (!parsed.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid cancel payload.',
        details: parsed.error.issues,
      });
      return;
    }

    const actor = toActor(req.user);
    const result = await eventService.cancelPublishedEvent(actor, eventId, parsed.data.notes);
    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'EVENT_CANCEL_FAILED',
        message: result.error?.message ?? 'Failed to cancel event.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'EVENT_CANCEL_ERROR',
      message: 'Unexpected error while canceling event.',
      details: error,
    });
  }
}
