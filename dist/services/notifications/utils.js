"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationPayloadSchema = void 0;
exports.toServiceError = toServiceError;
exports.toDateBucket = toDateBucket;
exports.toDailyCounterKey = toDailyCounterKey;
exports.checkLimits = checkLimits;
exports.incrementLimitCounter = incrementLimitCounter;
exports.getUserPrefs = getUserPrefs;
exports.mergeSimilar = mergeSimilar;
exports.buildEmailDetails = buildEmailDetails;
exports.parseAndValidatePayload = parseAndValidatePayload;
const zod_1 = require("zod");
const DEFAULT_DAILY_LIMIT = 50;
const dailyCounter = new Map();
exports.notificationPayloadSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid(),
    user_id: zod_1.z.string().uuid().nullable().optional(),
    created_by_user_id: zod_1.z.string().uuid().nullable().optional(),
    type: zod_1.z.enum([
        'new_review_needed',
        'event_accepted',
        'event_rejected',
        'event_rescheduled',
        'event_canceled',
        'signup_approval_needed',
        'broadcast',
    ]),
    title: zod_1.z.string().trim().min(2),
    message: zod_1.z.string().trim().min(1),
    data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    priority: zod_1.z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    send_email: zod_1.z.boolean().optional(),
    dedupe_window_minutes: zod_1.z.number().int().min(1).max(60).optional(),
});
function toServiceError(code, message, details) {
    return { code, message, details };
}
function toDateBucket(input = new Date()) {
    return input.toISOString().slice(0, 10);
}
function toDailyCounterKey(orgId, userId, channel) {
    return `${orgId}:${userId}:${channel}`;
}
function checkLimits(params) {
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
function incrementLimitCounter(params) {
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
async function getUserPrefs(supabase, orgId, userId) {
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
    const row = (data ?? {});
    const enableAll = typeof row.enable_all === 'boolean'
        ? row.enable_all
        : typeof row.enable_all_notifications === 'boolean'
            ? row.enable_all_notifications
            : true;
    const enableInApp = typeof row.enable_in_app === 'boolean'
        ? row.enable_in_app
        : typeof row.enable_in_app_notifications === 'boolean'
            ? row.enable_in_app_notifications
            : true;
    const enableEmail = typeof row.enable_email === 'boolean'
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
function mergeSimilar(params) {
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
function pickString(data, key, fallback = '') {
    const raw = data[key];
    return typeof raw === 'string' && raw.trim().length > 0 ? raw : fallback;
}
function buildEmailDetails(payload, recipientEmail) {
    const data = payload.data ?? {};
    const actor = pickString(data, 'actor_name', 'A team member');
    const eventName = pickString(data, 'event_name', 'the event');
    const when = pickString(data, 'when', pickString(data, 'event_date', 'N/A'));
    const notes = pickString(data, 'notes', pickString(data, 'reason', 'No additional notes.'));
    const subjectMap = {
        new_review_needed: `Review needed: ${eventName}`,
        event_accepted: `Event accepted: ${eventName}`,
        event_rejected: `Event rejected: ${eventName}`,
        event_rescheduled: `Event rescheduled: ${eventName}`,
        event_canceled: `Event canceled: ${eventName}`,
        signup_approval_needed: 'New staff signup requires approval',
        broadcast: payload.title,
    };
    const messageMap = {
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
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
async function parseAndValidatePayload(payload) {
    const parsed = exports.notificationPayloadSchema.safeParse(payload);
    if (!parsed.success) {
        return {
            data: null,
            error: toServiceError('NOTIFICATION_VALIDATION_FAILED', 'Invalid notification payload.', parsed.error.issues),
        };
    }
    return { data: parsed.data, error: null };
}
