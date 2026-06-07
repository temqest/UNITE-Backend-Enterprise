import { z } from 'zod';
import { EventService } from '../../../../services/events/event.service';
import type { EventActorContext, EventFilter } from '../../../../services/events/event.types';
import type { EventCreateInput, EventStatus, EventUpdateInput } from '../../../../models/events/types';
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
const eventTypeSchema = z.enum(['blood_drive', 'training', 'advocacy', 'assembly']);
const eventStatusSchema = z.enum(['draft', 'plotted', 'needs_details', 'scheduled', 'published', 'ongoing', 'completed', 'cancelled']);
const eventSetupStatusSchema = z.enum(['needs_details', 'pending_setup', 'complete']);
const eventCreationMethodSchema = z.enum(['manual', 'plotting_calendar']);

const createEventValidator = {
  validate: (payload: unknown) =>
    z
      .object({
        org_id: z.string().uuid().optional(),
        title: z.string().min(3),
        address: z.string().trim().min(1).optional().nullable(),
        type: eventTypeSchema,
        event_date: z.string().date(),
        start_time: z.string().optional().nullable(),
        end_time: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        image_url: z.string().url().optional().nullable(),
        extra_data: z.record(z.string(), z.unknown()).optional(),
        status: eventStatusSchema.optional(),
        setup_status: eventSetupStatusSchema.optional(),
        setup_completed_at: z.string().datetime().optional().nullable(),
        creation_method: eventCreationMethodSchema.optional(),
        plotting_calendar_id: z.string().uuid().optional().nullable(),
        hosting_organization: z.string().optional().nullable(),
        visibility: z.enum(['internal', 'public']).optional(),
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
        address: z.string().trim().min(1).optional().nullable(),
        type: eventTypeSchema.optional(),
        event_date: z.string().date().optional(),
        start_time: z.string().optional().nullable(),
        end_time: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        image_url: z.string().url().optional().nullable(),
        extra_data: z.record(z.string(), z.unknown()).optional(),
        status: eventStatusSchema.optional(),
        setup_status: eventSetupStatusSchema.optional(),
        setup_completed_at: z.string().datetime().optional().nullable(),
        creation_method: eventCreationMethodSchema.optional(),
        plotting_calendar_id: z.string().uuid().optional().nullable(),
        hosting_organization: z.string().optional().nullable(),
        visibility: z.enum(['internal', 'public']).optional(),
        completed_at: z.string().datetime().optional().nullable(),
        actual_collected_bags: z.number().int().min(0).optional().nullable(),
        actual_donors: z.number().int().min(0).optional().nullable(),
        wastage_units: z.number().int().min(0).optional().nullable(),
        post_event_notes: z.string().optional().nullable(),
        post_event_attachments: z.array(z.string().url()).optional(),
        is_public: z.boolean().optional(),
      })
      .safeParse(payload),
};

const statusUpdateValidator = {
  validate: (payload: unknown) =>
    z
      .object({
        status: eventStatusSchema,
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

function requireAuthedOrgUser(req: Request, res: Response): AuthenticatedUser | null {
  if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
    sendError(res, 401, {
      code: 'UNAUTHORIZED',
      message: 'Active authenticated organization user required.',
    });
    return null;
  }

  return req.user;
}

function getEventId(req: Request): string | null {
  return req.params?.eventId ?? req.params?.id ?? null;
}

export async function quickCreateEventController(req: Request, res: Response): Promise<void> {
  try {
    const user = requireAuthedOrgUser(req, res);
    if (!user) return;

    const actor = toActor(user);
    const result = await eventService.quickCreateEvent(actor, {
      ...(req.body ?? {}),
      org_id: user.org_id,
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'EVENT_QUICK_CREATE_FAILED',
        message: result.error?.message ?? 'Failed to quick create event.',
        details: result.error?.details,
      });
      return;
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'EVENT_QUICK_CREATE_ERROR',
      message: 'Unexpected error while quick creating event.',
      details: error,
    });
  }
}

export async function createEventController(req: Request, res: Response): Promise<void> {
  try {
    const user = requireAuthedOrgUser(req, res);
    if (!user) return;

    const validated = createEventValidator.validate(req.body ?? {});
    if (!validated.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid create event payload.',
        details: validated.error.issues,
      });
      return;
    }

    if (validated.data.creation_method === 'plotting_calendar') {
      sendError(res, 400, {
        code: 'PLOTTING_CALENDAR_ENDPOINT_REQUIRED',
        message: 'Use /api/v1/plotting-calendars/:id/plot-event to create plotting-calendar events.',
      });
      return;
    }

    const actor = toActor(user);
    const payload: EventCreateInput = {
      ...validated.data,
      org_id: user.org_id!,
      creation_method: 'manual',
      extra_data: validated.data.extra_data ?? {},
    };

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

export async function createManualEventController(req: Request, res: Response): Promise<void> {
  return createEventController(req, res);
}

export async function getEventsController(req: Request, res: Response): Promise<void> {
  try {
    const user = requireAuthedOrgUser(req, res);
    if (!user) return;

    const query = req.query ?? {};
    const statusQuery = query.statuses ?? query.status;
    const typeQuery = query.types ?? query.type;

    const filter: EventFilter = {
      org_id: user.org_id,
      statuses: parseStringArray(statusQuery) as EventStatus[] | undefined,
      setup_statuses: parseStringArray(query.setup_status ?? query.setup_statuses) as EventFilter['setup_statuses'],
      creation_methods: parseStringArray(query.creation_method ?? query.creation_methods) as EventFilter['creation_methods'],
      types: parseStringArray(typeQuery) as EventFilter['types'],
      from_date: typeof query.from_date === 'string' ? query.from_date : undefined,
      to_date: typeof query.to_date === 'string' ? query.to_date : undefined,
      requested_by_user_id: typeof query.requested_by_user_id === 'string' ? query.requested_by_user_id : undefined,
      include_public: false, // Strictly confine operational data to the organization scope
      hosting_organization: typeof query.hosting_organization === 'string' ? query.hosting_organization : undefined,
      search: typeof query.search === 'string' ? query.search : undefined,
      limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
      offset: typeof query.offset === 'string' ? Number(query.offset) : undefined,
    };

    const actor = toActor(user);
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

export async function completeEventDetailsController(req: Request, res: Response): Promise<void> {
  try {
    const user = requireAuthedOrgUser(req, res);
    if (!user) return;

    const eventId = getEventId(req);
    if (!eventId) {
      sendError(res, 400, {
        code: 'EVENT_ID_REQUIRED',
        message: 'eventId path parameter is required.',
      });
      return;
    }

    const actor = toActor(user);
    const result = await eventService.completeEventDetails(actor, eventId, req.body ?? {});
    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'EVENT_COMPLETE_DETAILS_FAILED',
        message: result.error?.message ?? 'Failed to save event details.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'EVENT_COMPLETE_DETAILS_ERROR',
      message: 'Unexpected error while saving event details.',
      details: error,
    });
  }
}

export async function patchEventStatusController(req: Request, res: Response): Promise<void> {
  try {
    const user = requireAuthedOrgUser(req, res);
    if (!user) return;

    const eventId = getEventId(req);
    if (!eventId) {
      sendError(res, 400, {
        code: 'EVENT_ID_REQUIRED',
        message: 'eventId path parameter is required.',
      });
      return;
    }

    const validated = statusUpdateValidator.validate(req.body ?? {});
    if (!validated.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid event status payload.',
        details: validated.error.issues,
      });
      return;
    }

    const result = await eventService.setEventStatus(toActor(user), eventId, validated.data);
    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'EVENT_STATUS_UPDATE_FAILED',
        message: result.error?.message ?? 'Failed to update event status.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'EVENT_STATUS_UPDATE_ERROR',
      message: 'Unexpected error while updating event status.',
      details: error,
    });
  }
}
export async function publishEventController(req: Request, res: Response): Promise<void> {
  try {
    const user = requireAuthedOrgUser(req, res);
    if (!user) return;

    const eventId = getEventId(req);
    if (!eventId) {
      sendError(res, 400, {
        code: 'EVENT_ID_REQUIRED',
        message: 'eventId path parameter is required.',
      });
      return;
    }

    const result = await eventService.publishEvent(toActor(user), eventId);
    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'EVENT_PUBLISH_FAILED',
        message: result.error?.message ?? 'Failed to publish event.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'EVENT_PUBLISH_ERROR',
      message: 'Unexpected error while publishing event.',
      details: error,
    });
  }
}

export async function getPublicEventsController(req: Request, res: Response): Promise<void> {
  try {
    const query = req.query ?? {};
    const typeQuery = query.types ?? query.type;

    const result = await eventService.listPublicEvents({
      from_date: typeof query.from_date === 'string' ? query.from_date : undefined,
      to_date: typeof query.to_date === 'string' ? query.to_date : undefined,
      types: parseStringArray(typeQuery) as EventFilter['types'],
      search: typeof query.search === 'string' ? query.search : undefined,
      limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
      offset: typeof query.offset === 'string' ? Number(query.offset) : undefined,
      province: typeof query.province === 'string' ? query.province : undefined,
      city: typeof query.city === 'string' ? query.city : undefined,
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'PUBLIC_EVENT_LIST_FAILED',
        message: result.error?.message ?? 'Failed to fetch public events.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'PUBLIC_EVENT_LIST_ERROR',
      message: 'Unexpected error while fetching public events.',
      details: error,
    });
  }
}

export async function updateEventController(req: Request, res: Response): Promise<void> {
  try {
    const user = requireAuthedOrgUser(req, res);
    if (!user) return;

    const eventId = getEventId(req);
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

    const result = await eventService.updateEvent(toActor(user), eventId, validated.data as EventUpdateInput);
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

export async function deleteEventController(req: Request, res: Response): Promise<void> {
  try {
    const user = requireAuthedOrgUser(req, res);
    if (!user) return;

    const eventId = getEventId(req);
    if (!eventId) {
      sendError(res, 400, {
        code: 'EVENT_ID_REQUIRED',
        message: 'eventId path parameter is required.',
      });
      return;
    }

    const result = await eventService.deleteEvent(toActor(user), eventId);
    if (result.error) {
      sendError(res, 400, {
        code: result.error.code,
        message: result.error.message,
        details: result.error.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: null });
  } catch (error) {
    sendError(res, 500, {
      code: 'EVENT_DELETE_ERROR',
      message: 'Unexpected error while deleting event.',
      details: error,
    });
  }
}

export async function deprecatedEventWorkflowController(req: Request, res: Response): Promise<void> {
  void req;
  res.status(410).json({
    success: false,
    error: {
      code: 'EVENT_WORKFLOW_DEPRECATED',
      message: 'Approve, reject, and reschedule review actions are deprecated. Use complete-details, publish, or status updates instead.',
    },
  });
}
