import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EmailDetails,
  NotificationPayload,
  NotificationType,
  QueueDecision,
  ServiceError,
  ServiceResult,
  UserNotificationPreferences,
} from './types';

const DEFAULT_DAILY_LIMIT = 50;

const dailyCounter = new Map<string, { day: string; count: number }>();

export const notificationPayloadSchema = z.object({
  org_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  created_by_user_id: z.string().uuid().nullable().optional(),
  type: z.enum([
    'new_review_needed',
    'event_accepted',
    'event_rejected',
    'event_rescheduled',
    'event_canceled',
    'signup_approval_needed',
    'broadcast',
  ]),
  title: z.string().trim().min(2),
  message: z.string().trim().min(1),
  data: z.record(z.string(), z.unknown()).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  send_email: z.boolean().optional(),
  dedupe_window_minutes: z.number().int().min(1).max(60).optional(),
});

export function toServiceError(code: string, message: string, details?: unknown): ServiceError {
  return { code, message, details };
}

export function toDateBucket(input = new Date()): string {
  return input.toISOString().slice(0, 10);
}

export function toDailyCounterKey(orgId: string, userId: string, channel: 'in_app' | 'email'): string {
  return `${orgId}:${userId}:${channel}`;
}

export function checkLimits(params: {
  org_id: string;
  user_id: string;
  channel: 'in_app' | 'email';
  threshold?: number;
}): QueueDecision {
  const threshold = params.threshold ?? DEFAULT_DAILY_LIMIT;
  const key = toDailyCounterKey(params.org_id, params.user_id, params.channel);
  const today = toDateBucket();
  const current = dailyCounter.get(key);

  if (!current || current.day !== today) {
    if (dailyCounter.size > 200) {
      for (const [k, v] of dailyCounter.entries()) {
        if (v.day !== today) {
          dailyCounter.delete(k);
        }
      }
    }
    dailyCounter.set(key, { day: today, count: 0 });
    return { allowed: true, queued: false, merged: false };
  }

  if (current.count >= threshold) {
    return {
      allowed: false,
      queued: true,
      merged: false,
      reason: `daily_${params.channel}_limit_exceeded`,
    };
  }

  return { allowed: true, queued: false, merged: false };
}

export function incrementLimitCounter(params: {
  org_id: string;
  user_id: string;
  channel: 'in_app' | 'email';
  amount?: number;
}): void {
  const key = toDailyCounterKey(params.org_id, params.user_id, params.channel);
  const today = toDateBucket();
  const amount = params.amount ?? 1;
  const current = dailyCounter.get(key);

  if (!current || current.day !== today) {
    dailyCounter.set(key, { day: today, count: amount });
    return;
  }

  current.count += amount;
  dailyCounter.set(key, current);
}

export async function getUserPrefs(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<ServiceResult<UserNotificationPreferences>> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      error: toServiceError('USER_PREFS_LOOKUP_FAILED', 'Failed to load user notification preferences.', error),
    };
  }

  const row = (data ?? {}) as Record<string, unknown>;

  const enableAll =
    typeof row.enable_all === 'boolean'
      ? row.enable_all
      : typeof row.enable_all_notifications === 'boolean'
      ? row.enable_all_notifications
      : true;

  const enableInApp =
    typeof row.enable_in_app === 'boolean'
      ? row.enable_in_app
      : typeof row.enable_in_app_notifications === 'boolean'
      ? row.enable_in_app_notifications
      : true;

  const enableEmail =
    typeof row.enable_email === 'boolean'
      ? row.enable_email
      : typeof row.enable_email_notifications === 'boolean'
      ? row.enable_email_notifications
      : true;

  return {
    data: {
      enable_all: enableAll,
      enable_in_app: enableInApp,
      enable_email: enableEmail,
      raw: row,
    },
    error: null,
  };
}

export function mergeSimilar(params: {
  type: NotificationType;
  incomingTitle: string;
  incomingMessage: string;
  existingAggregate?: number;
}): { title: string; message: string; aggregate_count: number } {
  const current = params.existingAggregate ?? 1;
  const next = current + 1;

  if (params.type === 'new_review_needed') {
    return {
      title: `${next} events need review`,
      message: `You have ${next} pending event review requests.`,
      aggregate_count: next,
    };
  }

  return {
    title: `${params.incomingTitle} (${next})`,
    message: `You have ${next} similar updates. Latest: ${params.incomingMessage}`,
    aggregate_count: next,
  };
}

function pickString(data: Record<string, unknown>, key: string, fallback = ''): string {
  const raw = data[key];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : fallback;
}

export function buildEmailDetails(payload: NotificationPayload, recipientEmail: string): EmailDetails {
  const data = payload.data ?? {};
  const actor = pickString(data, 'actor_name', 'A team member');
  const eventName = pickString(data, 'event_name', 'the event');
  const when = pickString(data, 'when', pickString(data, 'event_date', 'N/A'));
  const notes = pickString(data, 'notes', pickString(data, 'reason', 'No additional notes.'));

  const subjectMap: Record<NotificationType, string> = {
    new_review_needed: `Review needed: ${eventName}`,
    event_accepted: `Event accepted: ${eventName}`,
    event_rejected: `Event rejected: ${eventName}`,
    event_rescheduled: `Event rescheduled: ${eventName}`,
    event_canceled: `Event canceled: ${eventName}`,
    signup_approval_needed: 'New staff signup requires approval',
    broadcast: payload.title,
  };

  const messageMap: Record<NotificationType, string> = {
    new_review_needed: `${actor} requested approval for ${eventName}.`,
    event_accepted: `${actor} accepted ${eventName}.`,
    event_rejected: `${actor} rejected ${eventName}. Notes: ${notes}`,
    event_rescheduled: `${actor} rescheduled ${eventName} to ${when}. Notes: ${notes}`,
    event_canceled: `${actor} canceled ${eventName}. Notes: ${notes}`,
    signup_approval_needed: `${actor} submitted a staff signup pending approval.`,
    broadcast: payload.message,
  };

  const subject = subjectMap[payload.type] ?? payload.title;
  const text = `${messageMap[payload.type] ?? payload.message}\n\nWhen: ${when}\n\n${payload.message}`;
  const html = [
    `<p>${escapeHtml(messageMap[payload.type] ?? payload.message)}</p>`,
    `<p><strong>When:</strong> ${escapeHtml(when)}</p>`,
    `<p>${escapeHtml(payload.message)}</p>`,
  ].join('');

  return {
    to: recipientEmail,
    subject,
    text,
    html,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function parseAndValidatePayload(
  payload: NotificationPayload
): Promise<ServiceResult<z.infer<typeof notificationPayloadSchema>>> {
  const parsed = notificationPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      data: null,
      error: toServiceError('NOTIFICATION_VALIDATION_FAILED', 'Invalid notification payload.', parsed.error.issues),
    };
  }

  return { data: parsed.data, error: null };
}
