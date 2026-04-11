"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEventController = createEventController;
exports.getEventsController = getEventsController;
exports.getPublicEventsController = getPublicEventsController;
exports.updateEventController = updateEventController;
exports.deleteEventController = deleteEventController;
const zod_1 = require("zod");
const event_service_1 = require("../../../../services/events/event.service");
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const eventService = new event_service_1.EventService(supabase_client_1.supabaseServer);
const createEventValidator = {
    validate: (payload) => zod_1.z
        .object({
        org_id: zod_1.z.string().uuid().optional(),
        title: zod_1.z.string().min(3),
        address: zod_1.z.string().trim().min(1),
        type: zod_1.z.enum(['blood_drive', 'training', 'advocacy', 'assembly']),
        event_date: zod_1.z.string().date(),
        start_time: zod_1.z.string(),
        end_time: zod_1.z.string(),
        description: zod_1.z.string().optional().nullable(),
        image_url: zod_1.z.string().url().optional().nullable(),
        extra_data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
        status: zod_1.z.enum(['requested', 'pending', 'approved', 'rejected', 'rescheduled', 'completed']).optional(),
        requested_by_user_id: zod_1.z.string().uuid().optional().nullable(),
        is_public: zod_1.z.boolean().optional(),
    })
        .safeParse(payload),
};
const updateEventValidator = {
    validate: (payload) => zod_1.z
        .object({
        title: zod_1.z.string().min(3).optional(),
        address: zod_1.z.string().trim().min(1).optional(),
        type: zod_1.z.enum(['blood_drive', 'training', 'advocacy', 'assembly']).optional(),
        event_date: zod_1.z.string().date().optional(),
        start_time: zod_1.z.string().optional(),
        end_time: zod_1.z.string().optional(),
        description: zod_1.z.string().optional().nullable(),
        image_url: zod_1.z.string().url().optional().nullable(),
        extra_data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
        status: zod_1.z.enum(['requested', 'pending', 'approved', 'rejected', 'rescheduled', 'completed']).optional(),
        completed_at: zod_1.z.string().datetime().optional().nullable(),
        actual_collected_bags: zod_1.z.number().int().min(0).optional().nullable(),
        actual_donors: zod_1.z.number().int().min(0).optional().nullable(),
        wastage_units: zod_1.z.number().int().min(0).optional().nullable(),
        post_event_notes: zod_1.z.string().optional().nullable(),
        post_event_attachments: zod_1.z.array(zod_1.z.string().url()).optional(),
        is_public: zod_1.z.boolean().optional(),
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
function parseStringArray(input) {
    if (Array.isArray(input)) {
        return input.filter((item) => typeof item === 'string');
    }
    if (typeof input === 'string') {
        return input
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
    }
    return undefined;
}
async function createEventController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated organization user required.',
            });
            return;
        }
        const validated = createEventValidator.validate(req.body ?? {});
        if (!validated.success) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid create event payload.',
                details: validated.error.issues,
            });
            return;
        }
        const actor = toActor(req.user);
        const payload = {
            ...validated.data,
            org_id: validated.data.org_id ?? req.user.org_id,
        };
        const result = await eventService.createEvent(actor, payload);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'EVENT_CREATE_FAILED',
                message: result.error?.message ?? 'Failed to create event.',
                details: result.error?.details,
            });
            return;
        }
        res.status(201).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'EVENT_CREATE_ERROR',
            message: 'Unexpected error while creating event.',
            details: error,
        });
    }
}
async function getEventsController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated user required.',
            });
            return;
        }
        if (!req.user.org_id) {
            sendError(res, 403, {
                code: 'FORBIDDEN_ORG_SCOPE_REQUIRED',
                message: 'Organization membership is required to list events.',
            });
            return;
        }
        const query = req.query ?? {};
        const statusQuery = query.statuses ?? query.status;
        const typeQuery = query.types ?? query.type;
        const filter = {
            org_id: typeof query.org_id === 'string' && query.org_id.trim().length > 0
                ? query.org_id
                : req.user.org_id,
            statuses: parseStringArray(statusQuery),
            types: parseStringArray(typeQuery),
            from_date: typeof query.from_date === 'string' ? query.from_date : undefined,
            to_date: typeof query.to_date === 'string' ? query.to_date : undefined,
            requested_by_user_id: typeof query.requested_by_user_id === 'string' ? query.requested_by_user_id : undefined,
            include_public: query.include_public === 'true' || query.include_public === true,
            search: typeof query.search === 'string' ? query.search : undefined,
            limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
            offset: typeof query.offset === 'string' ? Number(query.offset) : undefined,
        };
        const actor = toActor(req.user);
        const result = await eventService.listEvents(actor, filter);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'EVENT_LIST_FAILED',
                message: result.error?.message ?? 'Failed to fetch events.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'EVENT_LIST_ERROR',
            message: 'Unexpected error while fetching events.',
            details: error,
        });
    }
}
async function getPublicEventsController(req, res) {
    try {
        const query = req.query ?? {};
        const typeQuery = query.types ?? query.type;
        const result = await eventService.listPublicEvents({
            from_date: typeof query.from_date === 'string' ? query.from_date : undefined,
            to_date: typeof query.to_date === 'string' ? query.to_date : undefined,
            types: parseStringArray(typeQuery),
            search: typeof query.search === 'string' ? query.search : undefined,
            limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
            offset: typeof query.offset === 'string' ? Number(query.offset) : undefined,
            province: typeof query.province === 'string' ? query.province : undefined,
            city: typeof query.city === 'string' ? query.city : undefined,
        });
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'PUBLIC_EVENT_LIST_FAILED',
                message: result.error?.message ?? 'Failed to fetch public events.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'PUBLIC_EVENT_LIST_ERROR',
            message: 'Unexpected error while fetching public events.',
            details: error,
        });
    }
}
async function updateEventController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated organization user required.',
            });
            return;
        }
        const eventId = req.params?.eventId ?? req.params?.id;
        if (!eventId) {
            sendError(res, 400, {
                code: 'EVENT_ID_REQUIRED',
                message: 'eventId path parameter is required.',
            });
            return;
        }
        const validated = updateEventValidator.validate(req.body ?? {});
        if (!validated.success) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid update event payload.',
                details: validated.error.issues,
            });
            return;
        }
        const actor = toActor(req.user);
        const result = await eventService.updateEvent(actor, eventId, validated.data);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'EVENT_UPDATE_FAILED',
                message: result.error?.message ?? 'Failed to update event.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'EVENT_UPDATE_ERROR',
            message: 'Unexpected error while updating event.',
            details: error,
        });
    }
}
async function deleteEventController(req, res) {
    try {
        if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated organization user required.',
            });
            return;
        }
        const eventId = req.params?.eventId ?? req.params?.id;
        if (!eventId) {
            sendError(res, 400, {
                code: 'EVENT_ID_REQUIRED',
                message: 'eventId path parameter is required.',
            });
            return;
        }
        const actor = toActor(req.user);
        const result = await eventService.deleteEvent(actor, eventId);
        if (result.error) {
            sendError(res, 400, {
                code: result.error.code,
                message: result.error.message,
                details: result.error.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: null });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'EVENT_DELETE_ERROR',
            message: 'Unexpected error while deleting event.',
            details: error,
        });
    }
}
