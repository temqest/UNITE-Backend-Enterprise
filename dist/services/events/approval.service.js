"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventApprovalService = void 0;
const zod_1 = require("zod");
const event_types_1 = require("./event.types");
const notification_service_1 = require("../notifications/notification.service");
function getEventWorkflowScope(extraData) {
    const asRecord = extraData && typeof extraData === 'object' && !Array.isArray(extraData)
        ? extraData
        : {};
    const geoScopeRaw = asRecord.geo_scope;
    const geoScope = geoScopeRaw && typeof geoScopeRaw === 'object' && !Array.isArray(geoScopeRaw)
        ? geoScopeRaw
        : null;
    const reviewerRaw = asRecord.reviewer_user_id;
    const assignedReviewerUserId = typeof reviewerRaw === 'string' && reviewerRaw.trim().length > 0
        ? reviewerRaw.trim()
        : null;
    return { geoScope, assignedReviewerUserId };
}
const ApprovalActionSchema = zod_1.z
    .object({
    event_id: zod_1.z.string().uuid(),
    action: zod_1.z.enum(['accept', 'reject', 'reschedule']),
    notes: zod_1.z.string().trim().optional().nullable(),
    proposed_event_date: zod_1.z.string().date().optional(),
    proposed_start_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional(),
    proposed_end_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional(),
})
    .superRefine((val, ctx) => {
    if (val.action === 'reschedule') {
        if (!val.proposed_event_date || !val.proposed_start_time || !val.proposed_end_time) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'Reschedule action requires proposed_event_date, proposed_start_time, and proposed_end_time.',
                path: ['action'],
            });
        }
    }
});
class EventApprovalService {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
    }
    async getActorDisplayName(actor) {
        const { data } = await this.supabase
            .from('users')
            .select('first_name, last_name')
            .eq('id', actor.id)
            .maybeSingle();
        const first = data?.first_name?.trim() ?? '';
        const last = data?.last_name?.trim() ?? '';
        const fullName = [first, last].filter(Boolean).join(' ').trim();
        if (fullName) {
            return fullName;
        }
        return actor.role.type === 'super_admin' ? 'Super Admin' : 'A team member';
    }
    async getEvent(eventId) {
        const { data, error } = await this.supabase.from('events').select('*').eq('id', eventId).single();
        if (error || !data) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_NOT_FOUND', 'Event was not found.', error),
            };
        }
        return { data: data, error: null };
    }
    async getLatestApproval(eventId) {
        const { data, error } = await this.supabase
            .from('event_approvals')
            .select('*')
            .eq('event_id', eventId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('APPROVAL_LOOKUP_FAILED', 'Failed to fetch latest approval record.', error),
            };
        }
        return { data: data ?? null, error: null };
    }
    async notifyReviewers(params) {
        const reviewersResult = await this.getReviewersForEvent(params.event.id);
        if (reviewersResult.error || !reviewersResult.data) {
            return;
        }
        const actorName = await this.getActorDisplayName(params.actor);
        const reviewerIds = reviewersResult.data
            .map((reviewer) => reviewer.id)
            .filter((reviewerId) => reviewerId !== params.actor.id);
        if (reviewerIds.length === 0) {
            return;
        }
        await Promise.allSettled(reviewerIds.map(async (reviewerId) => {
            await notification_service_1.notificationService.notifyReviewNeeded({
                org_id: params.event.org_id,
                reviewer_user_id: reviewerId,
                actor_user_id: params.actor.id,
                actor_name: actorName,
                event_id: params.event.id,
                event_name: params.event.title,
                notes: params.notes ?? undefined,
            });
        }));
    }
    async createSystemLog(params) {
        await this.supabase.from('system_logs').insert({
            org_id: params.org_id,
            user_id: params.user_id,
            category: 'events',
            action_type: params.action_type,
            entity_type: 'event',
            entity_id: params.entity_id,
            payload: params.payload ?? {},
            status: params.status ?? null,
            notes: params.notes ?? null,
        });
    }
    getActionResultStatus(action) {
        if (action === 'accept') {
            return 'approved';
        }
        if (action === 'reject') {
            return 'rejected';
        }
        return 'rescheduled';
    }
    canReview(actor, event) {
        if (event.org_id !== actor.org_id) {
            return false;
        }
        const approverRole = (0, event_types_1.hasRoleAtLeast)(actor, 'coordinator');
        const approverPermission = (0, event_types_1.hasPermission)(actor, 'approve_events');
        if (!approverRole && !approverPermission) {
            return false;
        }
        const workflowScope = getEventWorkflowScope(event.extra_data);
        const eventGeoScope = workflowScope.geoScope;
        const assignedReviewerUserId = workflowScope.assignedReviewerUserId;
        if (assignedReviewerUserId && assignedReviewerUserId !== actor.id) {
            return false;
        }
        return (0, event_types_1.isGeoAreaMatch)(eventGeoScope, actor.geographic_area);
    }
    async getReviewersForEvent(eventId) {
        const eventResult = await this.getEvent(eventId);
        if (eventResult.error || !eventResult.data) {
            return { data: null, error: eventResult.error };
        }
        const event = eventResult.data;
        const { data, error } = await this.supabase
            .from('users')
            .select('*')
            .eq('org_id', event.org_id)
            .eq('is_active', true);
        if (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('REVIEWER_LOOKUP_FAILED', 'Failed to fetch reviewer candidates.', error),
            };
        }
        const workflowScope = getEventWorkflowScope(event.extra_data);
        const eventGeoScope = workflowScope.geoScope;
        const reviewers = (data ?? [])
            .filter((user) => {
            if (user.role.type === 'super_admin') {
                return true;
            }
            const permissions = user.role.permissions ?? [];
            const hasApprovePermission = permissions.includes('*') || permissions.includes('approve_events');
            const isCoordinator = user.role.type === 'coordinator' || user.role.type === 'admin';
            if (!hasApprovePermission && !isCoordinator) {
                return false;
            }
            const geoMatch = (0, event_types_1.isGeoAreaMatch)(eventGeoScope, user.geographic_area);
            return geoMatch;
        })
            .map((user) => ({
            ...user,
            reviewer_reason: user.role.type === 'super_admin'
                ? 'super_admin override'
                : 'matched role/permission and geographic area',
        }));
        return { data: reviewers, error: null };
    }
    async insertApprovalRecord(params) {
        await this.supabase.from('event_approvals').insert({
            org_id: params.event.org_id,
            event_id: params.event.id,
            acted_by_user_id: params.actor.id,
            action: params.action,
            from_status: params.event.status,
            to_status: params.to_status,
            approval_level: params.approval_level ?? params.actor.role.type,
            geo_scope: params.geo_scope ?? params.actor.geographic_area,
            notes: params.notes ?? null,
        });
    }
    async updateEventFromApproval(event, actionInput) {
        const targetStatus = this.getActionResultStatus(actionInput.action);
        if (!(0, event_types_1.canTransitionEventStatus)(event.status, targetStatus)) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('INVALID_STATUS_TRANSITION', `Invalid status transition: ${event.status} -> ${targetStatus}.`),
            };
        }
        const patch = { status: targetStatus };
        if (actionInput.action === 'reschedule') {
            patch.event_date = actionInput.proposed_event_date;
            patch.start_time = actionInput.proposed_start_time;
            patch.end_time = actionInput.proposed_end_time;
        }
        const { data, error } = await this.supabase
            .from('events')
            .update(patch)
            .eq('id', event.id)
            .eq('org_id', event.org_id)
            .select('*')
            .single();
        if (error || !data) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_APPROVAL_UPDATE_FAILED', 'Failed to update event after approval action.', error),
            };
        }
        return { data: data, error: null };
    }
    async requestApproval(actor, eventId, notes) {
        const eventResult = await this.getEvent(eventId);
        if (eventResult.error || !eventResult.data) {
            return { data: null, error: eventResult.error };
        }
        const event = eventResult.data;
        if (event.org_id !== actor.org_id) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'Cannot request approval for an external organization event.'),
            };
        }
        const canRequest = event.requested_by_user_id === actor.id ||
            (0, event_types_1.hasPermission)(actor, 'request_event_approval') ||
            (0, event_types_1.hasRoleAtLeast)(actor, 'staff');
        if (!canRequest) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to request approval.'),
            };
        }
        const targetStatus = event.status === 'rescheduled' ? 'pending' : 'pending';
        if (!(0, event_types_1.canTransitionEventStatus)(event.status, targetStatus)) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('INVALID_STATUS_TRANSITION', `Cannot request approval from ${event.status}.`),
            };
        }
        const { data, error } = await this.supabase
            .from('events')
            .update({ status: targetStatus })
            .eq('id', event.id)
            .eq('org_id', event.org_id)
            .select('*')
            .single();
        if (error || !data) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('APPROVAL_REQUEST_FAILED', 'Failed to move event into review queue.', error),
            };
        }
        const updated = data;
        await this.supabase.from('event_approvals').insert({
            org_id: updated.org_id,
            event_id: updated.id,
            acted_by_user_id: actor.id,
            action: 'request',
            from_status: event.status,
            to_status: updated.status,
            approval_level: actor.role.type,
            geo_scope: actor.geographic_area,
            notes: notes ?? 'Approval requested.',
        });
        await this.createSystemLog({
            org_id: updated.org_id,
            user_id: actor.id,
            action_type: 'event_updated',
            entity_id: updated.id,
            payload: {
                before_status: event.status,
                after_status: updated.status,
                action: 'request',
            },
            status: updated.status,
            notes: notes ?? 'Approval requested.',
        });
        await this.notifyReviewers({
            event: updated,
            actor,
            notes: notes ?? undefined,
        });
        return { data: updated, error: null };
    }
    async reviewApproval(actor, input) {
        try {
            const parsed = ApprovalActionSchema.parse(input);
            const eventResult = await this.getEvent(parsed.event_id);
            if (eventResult.error || !eventResult.data) {
                return { data: null, error: eventResult.error };
            }
            const event = eventResult.data;
            const latestApprovalResult = await this.getLatestApproval(event.id);
            if (latestApprovalResult.error) {
                return { data: null, error: latestApprovalResult.error };
            }
            const latestApproval = latestApprovalResult.data;
            const requesterId = event.requested_by_user_id;
            const isRequester = Boolean(requesterId) && actor.id === requesterId;
            const latestByRequester = Boolean(requesterId) && latestApproval?.acted_by_user_id === requesterId;
            const requesterTurn = Boolean(requesterId) && latestApproval ? !latestByRequester : isRequester;
            if (isRequester && !requesterTurn) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('REQUESTER_TURN_LOCKED', 'You cannot act on this request right now. Wait for a reviewer action first.'),
                };
            }
            if (!isRequester && requesterTurn) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('REVIEWER_TURN_LOCKED', 'A requester response is required before another reviewer can take action.'),
                };
            }
            if (!isRequester && !this.canReview(actor, event)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You are not allowed to review this event.'),
                };
            }
            if (!['requested', 'pending', 'rescheduled', 'approved'].includes(event.status)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('INVALID_STATUS_TRANSITION', `Cannot review an event currently in ${event.status} status.`),
                };
            }
            const isConsecutiveReviewerAction = !isRequester && latestApproval?.acted_by_user_id === actor.id && latestApproval?.to_status === event.status;
            if (isConsecutiveReviewerAction) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('REVIEWER_ACTION_LOCKED', 'You cannot take multiple review actions in a row on the same event. Wait for another reviewer action first.'),
                };
            }
            if (parsed.action === 'reschedule' &&
                event.status === 'rescheduled' &&
                latestApproval?.action === 'reschedule' &&
                latestApproval?.acted_by_user_id === actor.id) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('REVIEWER_ACTION_LOCKED', 'You already rescheduled this event. Wait for another reviewer action before rescheduling again.'),
                };
            }
            const updateResult = await this.updateEventFromApproval(event, parsed);
            if (updateResult.error || !updateResult.data) {
                return { data: null, error: updateResult.error };
            }
            const updated = updateResult.data;
            await this.insertApprovalRecord({
                event,
                actor,
                action: parsed.action,
                to_status: updated.status,
                notes: parsed.notes ?? null,
                approval_level: actor.role.type,
            });
            if (updated.requested_by_user_id && updated.requested_by_user_id !== actor.id) {
                const actorName = await this.getActorDisplayName(actor);
                await notification_service_1.notificationService.notifyEventStatusChange({
                    org_id: updated.org_id,
                    target_user_id: updated.requested_by_user_id,
                    actor_user_id: actor.id,
                    actor_name: actorName,
                    type: parsed.action === 'accept'
                        ? 'event_accepted'
                        : parsed.action === 'reject'
                            ? 'event_rejected'
                            : 'event_rescheduled',
                    event_id: updated.id,
                    event_name: updated.title,
                    notes: parsed.notes ?? undefined,
                    when: parsed.action === 'reschedule'
                        ? `${parsed.proposed_event_date ?? updated.event_date} ${parsed.proposed_start_time ?? updated.start_time}`
                        : undefined,
                });
            }
            await this.createSystemLog({
                org_id: updated.org_id,
                user_id: actor.id,
                action_type: parsed.action === 'accept'
                    ? 'event_approved'
                    : parsed.action === 'reject'
                        ? 'event_rejected'
                        : 'event_rescheduled',
                entity_id: updated.id,
                payload: {
                    action: parsed.action,
                    previous_status: event.status,
                    current_status: updated.status,
                    proposed_schedule: parsed.action === 'reschedule'
                        ? {
                            event_date: parsed.proposed_event_date,
                            start_time: parsed.proposed_start_time,
                            end_time: parsed.proposed_end_time,
                        }
                        : null,
                },
                status: updated.status,
                notes: parsed.notes ?? undefined,
            });
            return { data: updated, error: null };
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('APPROVAL_ACTION_INVALID', 'Invalid approval action payload.', error),
            };
        }
    }
}
exports.EventApprovalService = EventApprovalService;
