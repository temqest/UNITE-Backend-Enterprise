"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventApprovalService = void 0;
const event_types_1 = require("./event.types");
class EventApprovalService {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
        void this.supabase;
    }
    async getReviewersForEvent(_eventId) {
        return { data: [], error: null };
    }
    async requestApproval(_actor, _eventId, _notes) {
        return {
            data: null,
            error: (0, event_types_1.toServiceError)('EVENT_WORKFLOW_DEPRECATED', 'The request/approve event workflow has been deprecated. Use complete details, publish, or status updates instead.'),
        };
    }
    async reviewApproval(_actor, _input) {
        return {
            data: null,
            error: (0, event_types_1.toServiceError)('EVENT_WORKFLOW_DEPRECATED', 'The request/approve event workflow has been deprecated. Use complete details, publish, or status updates instead.'),
        };
    }
}
exports.EventApprovalService = EventApprovalService;
