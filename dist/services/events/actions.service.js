"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventActionsService = void 0;
const event_types_1 = require("./event.types");
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
class EventActionsService {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
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
    async getAvailableActions(actor, eventId) {
        const eventResult = await this.getEvent(eventId);
        if (eventResult.error || !eventResult.data) {
            return { data: null, error: eventResult.error };
        }
        const event = eventResult.data;
        const actions = new Set();
        const sameOrg = event.org_id === actor.org_id;
        const isRequester = event.requested_by_user_id === actor.id;
        const isAdminLike = (0, event_types_1.hasRoleAtLeast)(actor, 'admin') || (0, event_types_1.hasPermission)(actor, 'manage_events');
        if (!sameOrg && !event.is_public) {
            return {
                data: {
                    event_id: event.id,
                    status: event.status,
                    actions: [],
                },
                error: null,
            };
        }
        if (sameOrg) {
            actions.add('view_private');
        }
        const workflowScope = getEventWorkflowScope(event.extra_data);
        const eventGeoScope = workflowScope.geoScope;
        const assignedReviewerUserId = workflowScope.assignedReviewerUserId;
        const scopeMatch = (0, event_types_1.isGeoAreaMatch)(eventGeoScope, actor.geographic_area);
        const canActAsAssignedReviewer = !assignedReviewerUserId || assignedReviewerUserId === actor.id;
        const canRequest = sameOrg &&
            (isRequester || (0, event_types_1.hasPermission)(actor, 'request_event_approval') || (0, event_types_1.hasRoleAtLeast)(actor, 'staff'));
        if (canRequest && ['requested', 'rescheduled'].includes(event.status)) {
            actions.add('request_approval');
        }
        const canReview = sameOrg &&
            canActAsAssignedReviewer &&
            scopeMatch &&
            ((0, event_types_1.hasPermission)(actor, 'approve_events') || (0, event_types_1.hasRoleAtLeast)(actor, 'coordinator'));
        const canRequesterReview = sameOrg && isRequester;
        if ((canRequesterReview || canReview) && ['requested', 'pending', 'rescheduled', 'approved'].includes(event.status)) {
            actions.add('approve_event');
            actions.add('reject_event');
            actions.add('reschedule_event');
        }
        if (sameOrg && (isAdminLike || isRequester || (0, event_types_1.hasPermission)(actor, 'edit_events'))) {
            actions.add('edit_event');
        }
        if (sameOrg && canActAsAssignedReviewer && event.status === 'approved' && (canReview || isAdminLike)) {
            actions.add('cancel_published_event');
            actions.add('reschedule_published_event');
        }
        if (sameOrg && ((0, event_types_1.hasPermission)(actor, 'assign_event_staff') || (0, event_types_1.hasRoleAtLeast)(actor, 'coordinator'))) {
            actions.add('assign_staff');
            actions.add('remove_staff');
        }
        if (sameOrg && (0, event_types_1.hasRoleAtLeast)(actor, 'staff')) {
            actions.add('apply_as_staff');
        }
        if (event.is_public || sameOrg) {
            actions.add('apply_as_donor');
        }
        if (sameOrg && ((0, event_types_1.hasPermission)(actor, 'manage_event_participants') || (0, event_types_1.hasRoleAtLeast)(actor, 'coordinator'))) {
            actions.add('confirm_participant');
            actions.add('mark_participated');
            actions.add('mark_donated');
        }
        return {
            data: {
                event_id: event.id,
                status: event.status,
                actions: Array.from(actions),
            },
            error: null,
        };
    }
}
exports.EventActionsService = EventActionsService;
