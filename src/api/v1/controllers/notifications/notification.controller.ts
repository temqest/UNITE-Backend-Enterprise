import { type Request, type Response } from 'express';
import { notificationService } from '../../../../services/notifications/notification.service';

interface AuthenticatedUser {
  id: string;
  org_id?: string;
  is_active?: boolean;
}

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

function sendError(res: Response, statusCode: number, error: ApiError): void {
  res.status(statusCode).json({ success: false, error });
}

function parseBoolean(value: unknown, defaultValue = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return defaultValue;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function parseTypes(value: unknown): Array<'new_review_needed' | 'event_accepted' | 'event_rejected' | 'event_rescheduled' | 'event_canceled' | 'signup_approval_needed' | 'broadcast'> | undefined {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',').map((item) => item.trim())
      : [];

  const allowed = new Set([
    'new_review_needed',
    'event_accepted',
    'event_rejected',
    'event_rescheduled',
    'event_canceled',
    'signup_approval_needed',
    'broadcast',
  ]);

  const filtered = raw.filter(
    (item): item is 'new_review_needed' | 'event_accepted' | 'event_rejected' | 'event_rescheduled' | 'event_canceled' | 'signup_approval_needed' | 'broadcast' =>
      typeof item === 'string' && allowed.has(item)
  );

  return filtered.length > 0 ? filtered : undefined;
}

export async function getNotificationsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user?.id || !req.user.org_id || req.user.is_active === false) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated organization user required.',
      });
      return;
    }

    const result = await notificationService.listNotifications({
      org_id: req.user.org_id,
      user_id: req.user.id,
      include_read: parseBoolean(req.query?.include_read),
      include_broadcast: parseBoolean(req.query?.include_broadcast, true),
      types: parseTypes(req.query?.types),
      limit: parseNumber(req.query?.limit),
      offset: parseNumber(req.query?.offset),
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'NOTIFICATION_LIST_FAILED',
        message: result.error?.message ?? 'Failed to fetch notifications.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'NOTIFICATION_LIST_ERROR',
      message: 'Unexpected error while fetching notifications.',
      details: error,
    });
  }
}

export async function markNotificationReadController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user?.id || !req.user.org_id || req.user.is_active === false) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated organization user required.',
      });
      return;
    }

    const rawNotificationId = req.params?.notificationId ?? req.params?.id;
    const notificationId = Array.isArray(rawNotificationId)
      ? rawNotificationId[0]
      : rawNotificationId;
    if (!notificationId) {
      sendError(res, 400, {
        code: 'NOTIFICATION_ID_REQUIRED',
        message: 'notificationId path parameter is required.',
      });
      return;
    }

    const result = await notificationService.markRead(req.user.org_id, req.user.id, notificationId);
    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'NOTIFICATION_MARK_READ_FAILED',
        message: result.error?.message ?? 'Failed to mark notification as read.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'NOTIFICATION_MARK_READ_ERROR',
      message: 'Unexpected error while marking notification as read.',
      details: error,
    });
  }
}

export async function getUnreadCountController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user?.id || !req.user.org_id || req.user.is_active === false) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated organization user required.',
      });
      return;
    }

    const result = await notificationService.getUnreadCount(req.user.org_id, req.user.id);
    if (result.error || result.data === null) {
      sendError(res, 400, {
        code: result.error?.code ?? 'NOTIFICATION_UNREAD_COUNT_FAILED',
        message: result.error?.message ?? 'Failed to get unread notification count.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        unread_count: result.data,
      },
    });
  } catch (error) {
    sendError(res, 500, {
      code: 'NOTIFICATION_UNREAD_COUNT_ERROR',
      message: 'Unexpected error while getting unread notification count.',
      details: error,
    });
  }
}