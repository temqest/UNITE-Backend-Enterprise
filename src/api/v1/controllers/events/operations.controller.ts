import type { EventStatus, EventType } from '../../../../models/events/types';
import type { EventActorContext } from '../../../../services/events/event.types';
import { EventOperationsService } from '../../../../services/events/operations.service';
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

const eventOperationsService = new EventOperationsService(supabaseServer);

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

function parseEnumArray<T extends string>(input: unknown, allowedValues: readonly T[]): T[] | undefined {
  const allowedSet = new Set(allowedValues);

  const rawValues = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : [];

  const parsed = rawValues
    .map((value) => String(value).trim())
    .filter((value): value is T => value.length > 0 && allowedSet.has(value as T));

  return parsed.length > 0 ? parsed : undefined;
}

export async function listMyEventsController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, 'UNAUTHORIZED', 'Active authenticated organization user required.');
      return;
    }

    const query = req.query ?? {};
    const allowedStatuses: EventStatus[] = ['draft', 'plotted', 'needs_details', 'scheduled', 'published', 'ongoing', 'completed', 'cancelled'];
    const allowedTypes: EventType[] = ['blood_drive', 'training', 'advocacy', 'assembly'];
    const filter = {
      statuses: parseEnumArray<EventStatus>(query.status, allowedStatuses),
      types: parseEnumArray<EventType>(query.type, allowedTypes),
      from_date: typeof query.from_date === 'string' ? query.from_date : undefined,
      to_date: typeof query.to_date === 'string' ? query.to_date : undefined,
      search: typeof query.search === 'string' ? query.search : undefined,
      limit: typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : undefined,
      offset: typeof query.offset === 'string' ? Number.parseInt(query.offset, 10) : undefined,
    };

    const result = await eventOperationsService.listMyEvents(toActor(req.user), filter);
    if (result.error || !result.data) {
      sendError(
        res,
        400,
        result.error?.code ?? 'MY_EVENTS_LIST_FAILED',
        result.error?.message ?? 'Failed to load my events.',
        result.error?.details
      );
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, 'MY_EVENTS_LIST_ERROR', 'Unexpected error while listing my events.', error);
  }
}

export async function getEventStatsController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, 'UNAUTHORIZED', 'Active authenticated organization user required.');
      return;
    }

    const eventId = req.params?.id;
    if (!eventId) {
      sendError(res, 400, 'EVENT_ID_REQUIRED', 'id path parameter is required.');
      return;
    }

    const result = await eventOperationsService.getEventStats(toActor(req.user), eventId);
    if (result.error || !result.data) {
      sendError(
        res,
        400,
        result.error?.code ?? 'EVENT_STATS_FAILED',
        result.error?.message ?? 'Failed to load event stats.',
        result.error?.details
      );
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, 'EVENT_STATS_ERROR', 'Unexpected error while fetching event stats.', error);
  }
}

export async function patchEventResultsController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, 'UNAUTHORIZED', 'Active authenticated organization user required.');
      return;
    }

    const eventId = req.params?.id;
    if (!eventId) {
      sendError(res, 400, 'EVENT_ID_REQUIRED', 'id path parameter is required.');
      return;
    }

    const result = await eventOperationsService.updateEventResults(toActor(req.user), eventId, req.body ?? {});
    if (result.error || !result.data) {
      sendError(
        res,
        400,
        result.error?.code ?? 'EVENT_RESULTS_UPDATE_FAILED',
        result.error?.message ?? 'Failed to update event results.',
        result.error?.details
      );
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, 'EVENT_RESULTS_UPDATE_ERROR', 'Unexpected error while updating event results.', error);
  }
}
