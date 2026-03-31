import { z } from 'zod';
import { EventParticipantsService } from '../../../../services/events/participants.service';
import { EventStaffService } from '../../../../services/events/staff.service';
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

const participantsService = new EventParticipantsService(supabaseServer);
const staffService = new EventStaffService(supabaseServer);

const assignStaffValidator = {
  validate: (payload: unknown) =>
    z
      .object({
        event_id: z.string().uuid().optional(),
        user_id: z.string().uuid(),
        assignment_role: z.enum(['lead', 'coordinator', 'staff', 'volunteer']),
        notes: z.string().optional().nullable(),
      })
      .safeParse(payload),
};

const applyParticipantValidator = {
  validate: (payload: unknown) =>
    z
      .object({
        event_id: z.string().uuid().optional(),
        participant_type: z.enum(['user', 'donor']),
        participant_user_id: z.string().uuid().optional().nullable(),
        participant_donor_id: z.string().uuid().optional().nullable(),
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

export async function assignStaffController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated organization user required.',
      });
      return;
    }

    const parsed = assignStaffValidator.validate(req.body ?? {});
    if (!parsed.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid assign staff payload.',
        details: parsed.error.issues,
      });
      return;
    }

    const eventId = parsed.data.event_id ?? req.params?.eventId ?? req.params?.id;
    if (!eventId) {
      sendError(res, 400, {
        code: 'EVENT_ID_REQUIRED',
        message: 'event_id or eventId path parameter is required.',
      });
      return;
    }

    const result = await staffService.assignStaff(toActor(req.user), {
      event_id: eventId,
      user_id: parsed.data.user_id,
      assignment_role: parsed.data.assignment_role,
      notes: parsed.data.notes ?? undefined,
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'ASSIGN_STAFF_FAILED',
        message: result.error?.message ?? 'Failed to assign staff.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'ASSIGN_STAFF_ERROR',
      message: 'Unexpected error while assigning staff.',
      details: error,
    });
  }
}

export async function applyAsParticipantController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated organization user required.',
      });
      return;
    }

    const parsed = applyParticipantValidator.validate(req.body ?? {});
    if (!parsed.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid participant apply payload.',
        details: parsed.error.issues,
      });
      return;
    }

    const eventId = parsed.data.event_id ?? req.params?.eventId ?? req.params?.id;
    if (!eventId) {
      sendError(res, 400, {
        code: 'EVENT_ID_REQUIRED',
        message: 'event_id or eventId path parameter is required.',
      });
      return;
    }

    const result = await participantsService.applyToEvent(toActor(req.user), {
      event_id: eventId,
      participant_type: parsed.data.participant_type,
      participant_user_id: parsed.data.participant_user_id ?? req.user.id,
      participant_donor_id: parsed.data.participant_donor_id,
      notes: parsed.data.notes ?? undefined,
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'PARTICIPANT_APPLY_FAILED',
        message: result.error?.message ?? 'Failed to apply as participant.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'PARTICIPANT_APPLY_ERROR',
      message: 'Unexpected error while applying as participant.',
      details: error,
    });
  }
}
