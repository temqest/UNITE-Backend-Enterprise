"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveEventController = approveEventController;
exports.rejectEventController = rejectEventController;
exports.rescheduleEventController = rescheduleEventController;
exports.cancelEventController = cancelEventController;
const zod_1 = require("zod");
const event_service_1 = require("../../../../services/events/event.service");
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const eventService = new event_service_1.EventService(supabase_client_1.supabaseServer);
const cancelValidator = {
    validate: (payload) => zod_1.z
        .object({
        notes: zod_1.z.string().optional().nullable(),
    })
        .safeParse(payload),
};
function sendError(res, statusCode, code, message, details) {
    res.status(statusCode).json({
        success: false,
        error: {
            code,
            message,
            details,
        },
    });
}
function toActor(user) {
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
function requireAuthedOrgUser(req, res) {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
        sendError(res, 401, 'UNAUTHORIZED', 'Active authenticated organization user required.');
        return null;
    }
    return req.user;
}
function getEventId(req) {
    return req.params?.eventId ?? req.params?.id ?? null;
}
async function sendDeprecatedWorkflowResponse(res) {
    sendError(res, 410, 'EVENT_WORKFLOW_DEPRECATED', 'Approve, reject, and reschedule review actions are deprecated. Use complete-details, publish, or status updates instead.');
}
async function approveEventController(_req, res) {
    await sendDeprecatedWorkflowResponse(res);
}
async function rejectEventController(_req, res) {
    await sendDeprecatedWorkflowResponse(res);
}
async function rescheduleEventController(_req, res) {
    await sendDeprecatedWorkflowResponse(res);
}
async function cancelEventController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const eventId = getEventId(req);
        if (!eventId) {
            sendError(res, 400, 'EVENT_ID_REQUIRED', 'eventId path parameter is required.');
            return;
        }
        const parsed = cancelValidator.validate(req.body ?? {});
        if (!parsed.success) {
            sendError(res, 400, 'VALIDATION_ERROR', 'Invalid cancel payload.', parsed.error.issues);
            return;
        }
        const result = await eventService.cancelPublishedEvent(toActor(user), eventId, parsed.data.notes ?? undefined);
        if (result.error || !result.data) {
            sendError(res, 400, result.error?.code ?? 'EVENT_CANCEL_FAILED', result.error?.message ?? 'Failed to cancel event.', result.error?.details);
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, 'EVENT_CANCEL_ERROR', 'Unexpected error while cancelling event.', error);
    }
}
