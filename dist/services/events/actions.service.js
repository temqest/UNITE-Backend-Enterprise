"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventActionsService = void 0;
const event_service_1 = require("./event.service");
class EventActionsService {
    supabase;
    eventService;
    constructor(supabase) {
        this.supabase = supabase;
        this.eventService = new event_service_1.EventService(supabase);
    }
    async getAvailableActions(actor, eventId) {
        const eventResult = await this.eventService.getEventById(eventId, actor);
        if (eventResult.error || !eventResult.data) {
            return { data: null, error: eventResult.error };
        }
        const event = eventResult.data;
        const sameOrg = event.org_id === actor.org_id;
        const canEdit = sameOrg && (event.requested_by_user_id === actor.id || actor.role.type === 'admin' || actor.role.type === 'coordinator');
        const canPublish = sameOrg && (actor.role.type === 'admin' || actor.role.type === 'coordinator');
        const actions = ['view_private'];
        if (canEdit) {
            actions.push('edit_event', 'complete_event_setup', 'change_event_status');
        }
        if (canPublish && event.status !== 'published') {
            actions.push('publish_event');
        }
        if (canPublish && !['completed', 'cancelled'].includes(event.status)) {
            actions.push('cancel_event');
        }
        return {
            data: {
                event_id: event.id,
                status: event.status,
                actions,
            },
            error: null,
        };
    }
}
exports.EventActionsService = EventActionsService;
