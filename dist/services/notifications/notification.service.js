"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationService = exports.NotificationService = void 0;
const zod_1 = require("zod");
const supabase_client_1 = require("../../lib/supabase/supabase.client");
const brevo_service_1 = require("../email/brevo.service");
const queue_service_1 = require("./queue.service");
const utils_1 = require("./utils");
const broadcastSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid(),
    created_by_user_id: zod_1.z.string().uuid().nullable().optional(),
    type: zod_1.z.literal('broadcast').optional(),
    title: zod_1.z.string().trim().min(2),
    message: zod_1.z.string().trim().min(1),
    data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    priority: zod_1.z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    target_user_ids: zod_1.z.array(zod_1.z.string().uuid()).optional(),
    target_role_types: zod_1.z.array(zod_1.z.string().trim().min(1)).optional(),
    send_email: zod_1.z.boolean().optional(),
});
// Email delivery is temporarily disabled platform-wide.
const EMAIL_NOTIFICATIONS_ENABLED = false;
function sanitizeError(error) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
        };
    }
    if (error && typeof error === 'object') {
        const candidate = error;
        return {
            code: candidate.code,
            message: candidate.message,
        };
    }
    return { message: String(error) };
}
class NotificationService {
    supabase;
    constructor(supabase = supabase_client_1.supabaseServer) {
        this.supabase = supabase;
    }
    async createNotification(payload) {
        const parsed = utils_1.notificationPayloadSchema.safeParse(payload);
        if (!parsed.success) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('NOTIFICATION_VALIDATION_FAILED', 'Invalid notification payload.', parsed.error.issues),
            };
        }
        const input = parsed.data;
        if (!input.user_id && input.type !== 'broadcast') {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('NOTIFICATION_USER_REQUIRED', 'user_id is required except for broadcast notifications.'),
            };
        }
        const userId = input.user_id ?? null;
        if (userId) {
            const prefsResult = await (0, utils_1.getUserPrefs)(this.supabase, input.org_id, userId);
            if (prefsResult.error || !prefsResult.data) {
                return { data: null, error: prefsResult.error };
            }
            const prefs = prefsResult.data;
            if (!prefs.enable_all) {
                await this.createSystemLog({
                    org_id: input.org_id,
                    user_id: input.created_by_user_id ?? null,
                    status: 'failed',
                    notes: 'Skipped notification send because user disabled all notifications.',
                    payload: { target_user_id: userId, type: input.type },
                });
                return {
                    data: null,
                    error: (0, utils_1.toServiceError)('NOTIFICATIONS_DISABLED', 'User has disabled all notifications.'),
                };
            }
            let row = null;
            if (prefs.enable_in_app) {
                const inAppLimit = (0, utils_1.checkLimits)({ org_id: input.org_id, user_id: userId, channel: 'in_app' });
                if (inAppLimit.allowed) {
                    const inAppResult = await this.sendInApp(input);
                    if (inAppResult.error) {
                        return { data: null, error: inAppResult.error };
                    }
                    row = inAppResult.data;
                    (0, utils_1.incrementLimitCounter)({ org_id: input.org_id, user_id: userId, channel: 'in_app' });
                }
                else {
                    await this.createSystemLog({
                        org_id: input.org_id,
                        user_id: input.created_by_user_id ?? null,
                        status: 'pending',
                        notes: 'In-app notification throttled by daily limit.',
                        payload: { target_user_id: userId, type: input.type, reason: inAppLimit.reason },
                    });
                }
            }
            const shouldSendEmail = input.send_email ?? true;
            if (EMAIL_NOTIFICATIONS_ENABLED && shouldSendEmail && prefs.enable_email) {
                const queueResult = await queue_service_1.notificationQueueService.enqueue(input, 'email');
                if (queueResult.error || !queueResult.data) {
                    await this.createSystemLog({
                        org_id: input.org_id,
                        user_id: input.created_by_user_id ?? null,
                        status: 'failed',
                        notes: 'Failed to enqueue email notification.',
                        payload: { target_user_id: userId, type: input.type, error: sanitizeError(queueResult.error) },
                    });
                    return { data: row, error: queueResult.error };
                }
                if (queueResult.data.deferred) {
                    await this.createSystemLog({
                        org_id: input.org_id,
                        user_id: input.created_by_user_id ?? null,
                        status: 'pending',
                        notes: 'Email queue overflow. Deferred for later cron/queue flush.',
                        payload: {
                            target_user_id: userId,
                            type: input.type,
                            job_id: queueResult.data.job.id,
                        },
                    });
                }
                else {
                    void this.flushEmailQueue().catch(async (flushError) => {
                        await this.createSystemLog({
                            org_id: input.org_id,
                            user_id: input.created_by_user_id ?? null,
                            status: 'failed',
                            notes: 'Background email queue flush failed.',
                            payload: { target_user_id: userId, type: input.type, error: sanitizeError(flushError) },
                        });
                    });
                }
            }
            return { data: row, error: null };
        }
        const inAppResult = await this.sendInApp({
            ...input,
            type: 'broadcast',
            user_id: null,
        });
        if (inAppResult.error) {
            return { data: null, error: inAppResult.error };
        }
        return { data: inAppResult.data, error: null };
    }
    async sendInApp(payload) {
        const parsed = utils_1.notificationPayloadSchema.safeParse(payload);
        if (!parsed.success) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('NOTIFICATION_VALIDATION_FAILED', 'Invalid in-app notification payload.', parsed.error.issues),
            };
        }
        const input = parsed.data;
        const dedupeWindowMinutes = input.dedupe_window_minutes ?? 5;
        if (input.user_id) {
            const recentIso = new Date(Date.now() - dedupeWindowMinutes * 60 * 1000).toISOString();
            const { data: existing, error: findError } = await this.supabase
                .from('notifications')
                .select('*')
                .eq('org_id', input.org_id)
                .eq('user_id', input.user_id)
                .eq('type', input.type)
                .eq('is_read', false)
                .gte('created_at', recentIso)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (findError) {
                return {
                    data: null,
                    error: (0, utils_1.toServiceError)('NOTIFICATION_LOOKUP_FAILED', 'Failed to detect similar notification for merge.', findError),
                };
            }
            if (existing) {
                const existingRow = existing;
                const existingData = existingRow.data && typeof existingRow.data === 'object' && !Array.isArray(existingRow.data)
                    ? existingRow.data
                    : {};
                const existingCountRaw = existingData.aggregate_count;
                const existingCount = typeof existingCountRaw === 'number' ? existingCountRaw : 1;
                const merged = (0, utils_1.mergeSimilar)({
                    type: input.type,
                    incomingTitle: input.title,
                    incomingMessage: input.message,
                    existingAggregate: existingCount,
                });
                const { data: updated, error: updateError } = await this.supabase
                    .from('notifications')
                    .update({
                    title: merged.title,
                    message: merged.message,
                    data: {
                        ...existingData,
                        ...(input.data ?? {}),
                        aggregate_count: merged.aggregate_count,
                        last_merged_at: new Date().toISOString(),
                    },
                    priority: input.priority ?? 'normal',
                })
                    .eq('id', existingRow.id)
                    .eq('org_id', input.org_id)
                    .select('*')
                    .single();
                if (updateError || !updated) {
                    return {
                        data: null,
                        error: (0, utils_1.toServiceError)('NOTIFICATION_MERGE_FAILED', 'Failed to merge similar in-app notification.', updateError),
                    };
                }
                await this.createSystemLog({
                    org_id: input.org_id,
                    user_id: input.created_by_user_id ?? null,
                    status: 'completed',
                    notes: 'Merged similar in-app notifications.',
                    payload: {
                        notification_id: updated.id,
                        target_user_id: input.user_id,
                        type: input.type,
                        aggregate_count: merged.aggregate_count,
                    },
                });
                return { data: updated, error: null };
            }
        }
        const { data, error } = await this.supabase
            .from('notifications')
            .insert({
            org_id: input.org_id,
            user_id: input.user_id ?? null,
            created_by_user_id: input.created_by_user_id ?? null,
            type: input.type,
            title: input.title,
            message: input.message,
            data: {
                ...(input.data ?? {}),
                aggregate_count: 1,
            },
            priority: input.priority ?? 'normal',
        })
            .select('*')
            .single();
        if (error || !data) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('NOTIFICATION_INSERT_FAILED', 'Failed to create in-app notification.', error),
            };
        }
        await this.createSystemLog({
            org_id: input.org_id,
            user_id: input.created_by_user_id ?? null,
            status: 'completed',
            notes: 'In-app notification created.',
            payload: {
                notification_id: data.id,
                target_user_id: input.user_id,
                type: input.type,
            },
        });
        return { data: data, error: null };
    }
    async sendEmail(payload) {
        if (!EMAIL_NOTIFICATIONS_ENABLED) {
            return { data: { sent: false }, error: null };
        }
        if (!payload.user_id) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('EMAIL_USER_REQUIRED', 'Email notifications require a target user_id.'),
            };
        }
        const prefsResult = await (0, utils_1.getUserPrefs)(this.supabase, payload.org_id, payload.user_id);
        if (prefsResult.error || !prefsResult.data) {
            return { data: null, error: prefsResult.error };
        }
        if (!prefsResult.data.enable_all || !prefsResult.data.enable_email) {
            return {
                data: { sent: false },
                error: (0, utils_1.toServiceError)('EMAIL_NOT_ALLOWED', 'User email notifications are disabled by preference.'),
            };
        }
        const { data: userData, error: userError } = await this.supabase
            .from('users')
            .select('email')
            .eq('id', payload.user_id)
            .eq('org_id', payload.org_id)
            .maybeSingle();
        if (userError) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('EMAIL_USER_LOOKUP_FAILED', 'Failed to resolve user email for notification.', userError),
            };
        }
        const email = userData?.email;
        if (!email) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('EMAIL_MISSING', 'User does not have a valid email address.'),
            };
        }
        const details = (0, utils_1.buildEmailDetails)(payload, email);
        try {
            await (0, brevo_service_1.sendEmail)({
                to: details.to,
                subject: details.subject,
                text: details.text,
                html: details.html,
            });
            await this.createSystemLog({
                org_id: payload.org_id,
                user_id: payload.created_by_user_id ?? null,
                status: 'completed',
                notes: 'Notification email sent.',
                payload: {
                    target_user_id: payload.user_id,
                    to: details.to,
                    type: payload.type,
                },
            });
            return { data: { sent: true }, error: null };
        }
        catch (error) {
            await this.createSystemLog({
                org_id: payload.org_id,
                user_id: payload.created_by_user_id ?? null,
                status: 'failed',
                notes: 'Notification email send failed.',
                payload: {
                    target_user_id: payload.user_id,
                    type: payload.type,
                    error: sanitizeError(error),
                },
            });
            return {
                data: null,
                error: (0, utils_1.toServiceError)('EMAIL_SEND_FAILED', 'Failed to send notification email.', error),
            };
        }
    }
    async flushEmailQueue() {
        const flushed = await queue_service_1.notificationQueueService.flush(async (job) => {
            const result = await this.sendEmail(job.payload);
            if (result.error) {
                throw result.error;
            }
        });
        if (flushed.error || !flushed.data) {
            return { data: null, error: flushed.error };
        }
        return { data: flushed.data, error: null };
    }
    async broadcast(payload) {
        const parsed = broadcastSchema.safeParse(payload);
        if (!parsed.success) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('BROADCAST_VALIDATION_FAILED', 'Invalid broadcast payload.', parsed.error.issues),
            };
        }
        const input = parsed.data;
        const baseResult = await this.createNotification({
            org_id: input.org_id,
            user_id: null,
            created_by_user_id: input.created_by_user_id ?? null,
            type: 'broadcast',
            title: input.title,
            message: input.message,
            data: {
                ...(input.data ?? {}),
                target_user_ids: input.target_user_ids ?? [],
                target_role_types: input.target_role_types ?? [],
            },
            priority: input.priority ?? 'normal',
            send_email: false,
        });
        if (baseResult.error || !baseResult.data) {
            return { data: null, error: baseResult.error };
        }
        const broadcastNotificationId = baseResult.data.id;
        const targets = await this.resolveBroadcastTargetUsers({
            org_id: input.org_id,
            target_user_ids: input.target_user_ids,
            target_role_types: input.target_role_types,
        });
        if (targets.error || !targets.data) {
            return { data: null, error: targets.error };
        }
        if (input.send_email ?? true) {
            const batchSizeRaw = Number.parseInt(process.env.NOTIFICATION_BROADCAST_BATCH_SIZE ?? '', 10);
            const batchSize = Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? batchSizeRaw : 25;
            for (let i = 0; i < targets.data.length; i += batchSize) {
                const batch = targets.data.slice(i, i + batchSize);
                await Promise.allSettled(batch.map(async (target) => this.createNotification({
                    org_id: input.org_id,
                    user_id: target.id,
                    created_by_user_id: input.created_by_user_id ?? null,
                    type: 'broadcast',
                    title: input.title,
                    message: input.message,
                    data: {
                        ...(input.data ?? {}),
                        broadcast_notification_id: broadcastNotificationId,
                    },
                    priority: input.priority ?? 'normal',
                    send_email: true,
                })));
            }
        }
        return {
            data: {
                notification_id: baseResult.data.id,
                targets: targets.data.length,
            },
            error: null,
        };
    }
    async getUnreadCount(orgId, userId) {
        const directUnread = await this.supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('user_id', userId)
            .eq('is_read', false);
        if (directUnread.error) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('UNREAD_COUNT_FAILED', 'Failed to load unread direct notifications count.', directUnread.error),
            };
        }
        const broadcastRows = await this.supabase
            .from('notifications')
            .select('id, data')
            .eq('org_id', orgId)
            .is('user_id', null)
            .order('created_at', { ascending: false });
        if (broadcastRows.error) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('UNREAD_COUNT_FAILED', 'Failed to load broadcast notifications.', broadcastRows.error),
            };
        }
        const userRoleResult = await this.supabase
            .from('users')
            .select('role')
            .eq('org_id', orgId)
            .eq('id', userId)
            .maybeSingle();
        if (userRoleResult.error) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('UNREAD_COUNT_FAILED', 'Failed to resolve user role for broadcast filtering.', userRoleResult.error),
            };
        }
        const roleType = userRoleResult.data?.role?.type ?? '';
        const broadcastIds = (broadcastRows.data ?? [])
            .filter((row) => this.matchesBroadcastRole(row, roleType))
            .map((row) => row.id);
        let unreadBroadcast = 0;
        if (broadcastIds.length > 0) {
            const readsResult = await this.supabase
                .from('notification_reads')
                .select('notification_id')
                .eq('org_id', orgId)
                .eq('user_id', userId)
                .in('notification_id', broadcastIds);
            if (readsResult.error) {
                return {
                    data: null,
                    error: (0, utils_1.toServiceError)('UNREAD_COUNT_FAILED', 'Failed to load broadcast read markers.', readsResult.error),
                };
            }
            const readSet = new Set((readsResult.data ?? []).map((entry) => entry.notification_id));
            unreadBroadcast = broadcastIds.filter((id) => !readSet.has(id)).length;
        }
        return {
            data: (directUnread.count ?? 0) + unreadBroadcast,
            error: null,
        };
    }
    async markRead(orgId, userId, notificationId) {
        const { data: notification, error: notificationError } = await this.supabase
            .from('notifications')
            .select('*')
            .eq('org_id', orgId)
            .eq('id', notificationId)
            .maybeSingle();
        if (notificationError || !notification) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('MARK_READ_FAILED', 'Notification not found.', notificationError),
            };
        }
        const row = notification;
        if (row.user_id === null) {
            const { error } = await this.supabase.from('notification_reads').upsert({
                org_id: orgId,
                user_id: userId,
                notification_id: notificationId,
                is_read: true,
                read_at: new Date().toISOString(),
            }, { onConflict: 'notification_id,user_id' });
            if (error) {
                return {
                    data: null,
                    error: (0, utils_1.toServiceError)('MARK_READ_FAILED', 'Failed to mark broadcast notification as read.', error),
                };
            }
            return { data: { marked: true }, error: null };
        }
        const { error } = await this.supabase
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('org_id', orgId)
            .eq('id', notificationId)
            .eq('user_id', userId);
        if (error) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('MARK_READ_FAILED', 'Failed to mark notification as read.', error),
            };
        }
        return { data: { marked: true }, error: null };
    }
    async listNotifications(input) {
        const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
        const offset = Math.max(input.offset ?? 0, 0);
        const baseQuery = this.supabase
            .from('notifications')
            .select('*', { count: 'exact' })
            .eq('org_id', input.org_id)
            .or(`user_id.eq.${input.user_id},user_id.is.null`)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (!input.include_read) {
            baseQuery.eq('is_read', false);
        }
        if (input.types && input.types.length > 0) {
            baseQuery.in('type', input.types);
        }
        const { data, error, count } = await baseQuery;
        if (error) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('LIST_NOTIFICATIONS_FAILED', 'Failed to list notifications.', error),
            };
        }
        const rows = (data ?? []).map((row) => row);
        const roleLookup = await this.supabase
            .from('users')
            .select('role')
            .eq('org_id', input.org_id)
            .eq('id', input.user_id)
            .maybeSingle();
        if (roleLookup.error) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('LIST_NOTIFICATIONS_FAILED', 'Failed to resolve user role.', roleLookup.error),
            };
        }
        const roleType = roleLookup.data?.role?.type ?? '';
        const filtered = rows.filter((row) => {
            if (row.user_id) {
                return row.user_id === input.user_id;
            }
            if (!input.include_broadcast && row.type === 'broadcast') {
                return false;
            }
            return this.matchesBroadcastRole(row, roleType);
        });
        const broadcastIds = filtered.filter((row) => row.user_id === null).map((row) => row.id);
        if (broadcastIds.length > 0) {
            const reads = await this.supabase
                .from('notification_reads')
                .select('notification_id, read_at')
                .eq('org_id', input.org_id)
                .eq('user_id', input.user_id)
                .in('notification_id', broadcastIds);
            if (reads.error) {
                return {
                    data: null,
                    error: (0, utils_1.toServiceError)('LIST_NOTIFICATIONS_FAILED', 'Failed to resolve broadcast read state.', reads.error),
                };
            }
            const readMap = new Map((reads.data ?? []).map((entry) => [
                entry.notification_id,
                entry.read_at,
            ]));
            for (const row of filtered) {
                if (row.user_id === null && readMap.has(row.id)) {
                    row.is_read = true;
                    row.read_at = readMap.get(row.id) ?? row.read_at;
                }
            }
        }
        const totalCount = count ?? filtered.length;
        return {
            data: {
                items: filtered,
                count: totalCount,
                has_more: offset + filtered.length < totalCount,
                limit,
                offset,
            },
            error: null,
        };
    }
    async notifyEventStatusChange(payload) {
        const titleByType = {
            event_accepted: 'Event accepted',
            event_rejected: 'Event rejected',
            event_rescheduled: 'Event rescheduled',
            event_canceled: 'Event canceled',
        };
        const actorName = payload.actor_name?.trim() || 'A reviewer';
        const notes = payload.notes?.trim();
        const messageByType = {
            event_accepted: `${actorName} approved ${payload.event_name}.`,
            event_rejected: `${actorName} rejected ${payload.event_name}.${notes ? ` Notes: ${notes}` : ''}`,
            event_rescheduled: `${actorName} rescheduled ${payload.event_name}${payload.when ? ` to ${payload.when}` : ''}.${notes ? ` Notes: ${notes}` : ''}`,
            event_canceled: `${actorName} canceled ${payload.event_name}.${notes ? ` Notes: ${notes}` : ''}`,
        };
        return this.createNotification({
            org_id: payload.org_id,
            user_id: payload.target_user_id,
            created_by_user_id: payload.actor_user_id,
            type: payload.type,
            title: `${titleByType[payload.type]}: ${payload.event_name}`,
            message: messageByType[payload.type],
            data: {
                event_id: payload.event_id,
                event_name: payload.event_name,
                actor_user_id: payload.actor_user_id,
                actor_name: actorName,
                notes: payload.notes,
                when: payload.when,
            },
            priority: payload.type === 'event_rejected' || payload.type === 'event_canceled' ? 'high' : 'normal',
            send_email: true,
        });
    }
    async notifyReviewNeeded(payload) {
        const actorName = payload.actor_name?.trim() || 'A requester';
        return this.createNotification({
            org_id: payload.org_id,
            user_id: payload.reviewer_user_id,
            created_by_user_id: payload.actor_user_id,
            type: 'new_review_needed',
            title: `Review needed: ${payload.event_name}`,
            message: `${actorName} requested review for ${payload.event_name}.${payload.notes?.trim() ? ` Notes: ${payload.notes.trim()}` : ''}`,
            data: {
                event_id: payload.event_id,
                event_name: payload.event_name,
                actor_user_id: payload.actor_user_id,
                actor_name: actorName,
                notes: payload.notes,
            },
            priority: 'high',
            send_email: true,
        });
    }
    async notifySignupApprovalNeeded(payload) {
        return this.createNotification({
            org_id: payload.org_id,
            user_id: payload.approver_user_id,
            created_by_user_id: payload.actor_user_id ?? null,
            type: 'signup_approval_needed',
            title: 'Staff signup approval needed',
            message: `${payload.pending_user_name} is waiting for account approval.`,
            data: {
                pending_user_id: payload.pending_user_id,
                pending_user_name: payload.pending_user_name,
            },
            priority: 'normal',
            send_email: true,
        });
    }
    async resolveBroadcastTargetUsers(params) {
        let query = this.supabase
            .from('users')
            .select('id, email, role')
            .eq('org_id', params.org_id)
            .eq('is_active', true);
        if (params.target_user_ids && params.target_user_ids.length > 0) {
            query = query.in('id', params.target_user_ids);
        }
        const { data, error } = await query;
        if (error) {
            return {
                data: null,
                error: (0, utils_1.toServiceError)('BROADCAST_TARGETS_FAILED', 'Failed to resolve broadcast targets.', error),
            };
        }
        const roleFilter = new Set((params.target_role_types ?? []).map((item) => item.toLowerCase()));
        const targets = (data ?? [])
            .filter((row) => {
            if (roleFilter.size === 0) {
                return true;
            }
            const roleType = (row.role?.type ?? '').toLowerCase();
            return roleFilter.has(roleType);
        })
            .map((row) => ({
            id: row.id,
            email: row.email,
        }));
        return { data: targets, error: null };
    }
    matchesBroadcastRole(notification, userRoleType) {
        const dataRaw = notification.data;
        if (!dataRaw || typeof dataRaw !== 'object' || Array.isArray(dataRaw)) {
            return true;
        }
        const targetRolesRaw = dataRaw.target_role_types;
        if (!Array.isArray(targetRolesRaw) || targetRolesRaw.length === 0) {
            return true;
        }
        const roleSet = new Set(targetRolesRaw
            .filter((entry) => typeof entry === 'string')
            .map((entry) => entry.toLowerCase()));
        return roleSet.has(userRoleType.toLowerCase());
    }
    async createSystemLog(input) {
        await this.supabase.from('system_logs').insert({
            org_id: input.org_id,
            user_id: input.user_id,
            category: 'system',
            action_type: 'settings_updated',
            entity_type: 'notification',
            entity_id: null,
            payload: {
                source: 'notification.service',
                ...(input.payload ?? {}),
            },
            notes: input.notes,
            status: input.status,
        });
    }
}
exports.NotificationService = NotificationService;
exports.notificationService = new NotificationService();
