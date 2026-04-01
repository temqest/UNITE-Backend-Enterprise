"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignStaffController = assignStaffController;
exports.applyAsParticipantController = applyAsParticipantController;
const zod_1 = require("zod");
const participants_service_1 = require("../../../../services/events/participants.service");
const staff_service_1 = require("../../../../services/events/staff.service");
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const participantsService = new participants_service_1.EventParticipantsService(supabase_client_1.supabaseServer);
const staffService = new staff_service_1.EventStaffService(supabase_client_1.supabaseServer);
const assignStaffValidator = {
    validate: (payload) => zod_1.z
        .object({
        event_id: zod_1.z.string().uuid().optional(),
        user_id: zod_1.z.string().uuid(),
        assignment_role: zod_1.z.enum(['lead', 'coordinator', 'staff', 'volunteer']),
        notes: zod_1.z.string().optional().nullable(),
    })
        .safeParse(payload),
};
const applyParticipantValidator = {
    validate: (payload) => zod_1.z
        .object({
        event_id: zod_1.z.string().uuid().optional(),
        participant_type: zod_1.z.enum(['user', 'donor']),
        participant_user_id: zod_1.z.string().uuid().optional().nullable(),
        participant_donor_id: zod_1.z.string().uuid().optional().nullable(),
        notes: zod_1.z.string().optional().nullable(),
    })
        .safeParse(payload),
};
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
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
async function assignStaffController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated organization user required.',
            });
            return;
        }
        const parsed = assignStaffValidator.validate(req.body ?? {});
        if (!parsed.success) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid assign staff payload.',
                details: parsed.error.issues,
            });
            return;
        }
        const eventId = parsed.data.event_id ?? req.params?.eventId ?? req.params?.id;
        if (!eventId) {
            sendError(res, 400, {
                code: 'EVENT_ID_REQUIRED',
                message: 'event_id or eventId path parameter is required.',
            });
            return;
        }
        const result = await staffService.assignStaff(toActor(req.user), {
            event_id: eventId,
            user_id: parsed.data.user_id,
            assignment_role: parsed.data.assignment_role,
            notes: parsed.data.notes ?? undefined,
        });
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'ASSIGN_STAFF_FAILED',
                message: result.error?.message ?? 'Failed to assign staff.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'ASSIGN_STAFF_ERROR',
            message: 'Unexpected error while assigning staff.',
            details: error,
        });
    }
}
async function applyAsParticipantController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated organization user required.',
            });
            return;
        }
        const parsed = applyParticipantValidator.validate(req.body ?? {});
        if (!parsed.success) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid participant apply payload.',
                details: parsed.error.issues,
            });
            return;
        }
        const eventId = parsed.data.event_id ?? req.params?.eventId ?? req.params?.id;
        if (!eventId) {
            sendError(res, 400, {
                code: 'EVENT_ID_REQUIRED',
                message: 'event_id or eventId path parameter is required.',
            });
            return;
        }
        const result = await participantsService.applyToEvent(toActor(req.user), {
            event_id: eventId,
            participant_type: parsed.data.participant_type,
            participant_user_id: parsed.data.participant_user_id ?? req.user.id,
            participant_donor_id: parsed.data.participant_donor_id,
            notes: parsed.data.notes ?? undefined,
        });
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'PARTICIPANT_APPLY_FAILED',
                message: result.error?.message ?? 'Failed to apply as participant.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'PARTICIPANT_APPLY_ERROR',
            message: 'Unexpected error while applying as participant.',
            details: error,
        });
    }
}
