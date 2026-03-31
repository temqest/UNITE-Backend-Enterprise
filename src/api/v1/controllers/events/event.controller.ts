import { z } from 'zod';
import { EventService } from '../../../../services/events/event.service';
import type { EventActorContext, EventFilter } from '../../../../services/events/event.types';
import type { EventCreateInput, EventUpdateInput } from '../../../../models/events/types';
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
  query?: Record<string, unknown>;
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

const eventService = new EventService(supabaseServer);

const createEventValidator = {
  validate: (payload: unknown) =>
    z
      .object({
        org_id: z.string().uuid().optional(),
        title: z.string().min(3),
        address: z.string().min(5),
        type: z.enum(['blood_drive', 'training', 'advocacy']),
        event_date: z.string().date(),
        start_time: z.string(),
        end_time: z.string(),
        description: z.string().optional().nullable(),
        image_url: z.string().url().optional().nullable(),
        extra_data: z.record(z.string(), z.unknown()),
        requested_by_user_id: z.string().uuid().optional().nullable(),
        is_public: z.boolean().optional(),
      })
      .safeParse(payload),
};

const updateEventValidator = {
  validate: (payload: unknown) =>
    z
      .object({
        title: z.string().min(3).optional(),
        address: z.string().min(5).optional(),
        type: z.enum(['blood_drive', 'training', 'advocacy']).optional(),
        event_date: z.string().date().optional(),
        start_time: z.string().optional(),
        end_time: z.string().optional(),
        description: z.string().optional().nullable(),
        image_url: z.string().url().optional().nullable(),
        extra_data: z.record(z.string(), z.unknown()).optional(),
        status: z.enum(['requested', 'pending', 'approved', 'rejected', 'rescheduled']).optional(),
        is_public: z.boolean().optional(),
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

function parseStringArray(input: unknown): string[] | undefined {
  if (Array.isArray(input)) {
    return input.filter((item): item is string => typeof item === 'string');
  }
  if (typeof input === 'string') {
    return input
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return undefined;
}

export async function createEventController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated organization user required.',
      });
      return;
    }

    const validated = createEventValidator.validate(req.body ?? {});
    if (!validated.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid create event payload.',
        details: validated.error.issues,
      });
      return;
    }

    const actor = toActor(req.user);
    const payload = {
      ...validated.data,
      org_id: validated.data.org_id ?? req.user.org_id,
    } as unknown as EventCreateInput;

    const result = await eventService.createEvent(actor, payload);
    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'EVENT_CREATE_FAILED',
        message: result.error?.message ?? 'Failed to create event.',
        details: result.error?.details,
      });
      return;
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'EVENT_CREATE_ERROR',
      message: 'Unexpected error while creating event.',
      details: error,
    });
  }
}

export async function getEventsController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    if (!req.user.org_id) {
      sendError(res, 403, {
        code: 'FORBIDDEN_ORG_SCOPE_REQUIRED',
        message: 'Organization membership is required to list events.',
      });
      return;
    }

    const query = req.query ?? {};
    const filter: EventFilter = {
      org_id:
        typeof query.org_id === 'string' && query.org_id.trim().length > 0
          ? query.org_id
          : req.user.org_id,
      statuses: parseStringArray(query.statuses) as EventFilter['statuses'],
      types: parseStringArray(query.types) as EventFilter['types'],
      from_date: typeof query.from_date === 'string' ? query.from_date : undefined,
      to_date: typeof query.to_date === 'string' ? query.to_date : undefined,
      requested_by_user_id:
        typeof query.requested_by_user_id === 'string' ? query.requested_by_user_id : undefined,
      include_public: query.include_public === 'true' || query.include_public === true,
      search: typeof query.search === 'string' ? query.search : undefined,
      limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
      offset: typeof query.offset === 'string' ? Number(query.offset) : undefined,
    };

    const actor = toActor(req.user);
    const result = await eventService.listEvents(actor, filter);
    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'EVENT_LIST_FAILED',
        message: result.error?.message ?? 'Failed to fetch events.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'EVENT_LIST_ERROR',
      message: 'Unexpected error while fetching events.',
      details: error,
    });
  }
}

export async function updateEventController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated organization user required.',
      });
      return;
    }

    const eventId = req.params?.eventId ?? req.params?.id;
    if (!eventId) {
      sendError(res, 400, {
        code: 'EVENT_ID_REQUIRED',
        message: 'eventId path parameter is required.',
      });
      return;
    }

    const validated = updateEventValidator.validate(req.body ?? {});
    if (!validated.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid update event payload.',
        details: validated.error.issues,
      });
      return;
    }

    const actor = toActor(req.user);
    const result = await eventService.updateEvent(actor, eventId, validated.data as EventUpdateInput);
    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'EVENT_UPDATE_FAILED',
        message: result.error?.message ?? 'Failed to update event.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'EVENT_UPDATE_ERROR',
      message: 'Unexpected error while updating event.',
      details: error,
    });
  }
}
