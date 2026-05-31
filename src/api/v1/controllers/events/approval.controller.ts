import { z } from 'zod';
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

const eventService = new EventService(supabaseServer);

const cancelValidator = {
  validate: (payload: unknown) =>
    z
      .object({
        notes: z.string().optional().nullable(),
      })
      .safeParse(payload),
};

function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): void {
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
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

function requireAuthedOrgUser(req: Request, res: Response): AuthenticatedUser | null {
  if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
    sendError(res, 401, 'UNAUTHORIZED', 'Active authenticated organization user required.');
    return null;
  }

  return req.user;
}

function getEventId(req: Request): string | null {
  return req.params?.eventId ?? req.params?.id ?? null;
}

async function sendDeprecatedWorkflowResponse(res: Response): Promise<void> {
  sendError(
    res,
    410,
    'EVENT_WORKFLOW_DEPRECATED',
    'Approve, reject, and reschedule review actions are deprecated. Use complete-details, publish, or status updates instead.'
  );
}

export async function approveEventController(_req: Request, res: Response): Promise<void> {
  await sendDeprecatedWorkflowResponse(res);
}

export async function rejectEventController(_req: Request, res: Response): Promise<void> {
  await sendDeprecatedWorkflowResponse(res);
}

export async function rescheduleEventController(_req: Request, res: Response): Promise<void> {
  await sendDeprecatedWorkflowResponse(res);
}

export async function cancelEventController(req: Request, res: Response): Promise<void> {
  try {
    const user = requireAuthedOrgUser(req, res);
    if (!user) return;

    const eventId = getEventId(req);
    if (!eventId) {
      sendError(res, 400, 'EVENT_ID_REQUIRED', 'eventId path parameter is required.');
      return;
    }

    const parsed = cancelValidator.validate(req.body ?? {});
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid cancel payload.', parsed.error.issues);
      return;
    }

    const result = await eventService.cancelPublishedEvent(toActor(user), eventId, parsed.data.notes ?? undefined);
    if (result.error || !result.data) {
      sendError(
        res,
        400,
        result.error?.code ?? 'EVENT_CANCEL_FAILED',
        result.error?.message ?? 'Failed to cancel event.',
        result.error?.details
      );
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, 'EVENT_CANCEL_ERROR', 'Unexpected error while cancelling event.', error);
  }
}
