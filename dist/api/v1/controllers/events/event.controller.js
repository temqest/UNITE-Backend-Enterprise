"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quickCreateEventController = quickCreateEventController;
exports.createEventController = createEventController;
exports.createManualEventController = createManualEventController;
exports.getEventsController = getEventsController;
exports.completeEventDetailsController = completeEventDetailsController;
exports.patchEventStatusController = patchEventStatusController;
exports.publishEventController = publishEventController;
exports.getPublicEventsController = getPublicEventsController;
exports.updateEventController = updateEventController;
exports.deleteEventController = deleteEventController;
exports.deprecatedEventWorkflowController = deprecatedEventWorkflowController;
const zod_1 = require("zod");
const event_service_1 = require("../../../../services/events/event.service");
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const eventService = new event_service_1.EventService(supabase_client_1.supabaseServer);
const eventTypeSchema = zod_1.z.enum(['blood_drive', 'training', 'advocacy', 'assembly']);
const eventStatusSchema = zod_1.z.enum(['draft', 'plotted', 'needs_details', 'scheduled', 'published', 'ongoing', 'completed', 'cancelled']);
const eventSetupStatusSchema = zod_1.z.enum(['needs_details', 'pending_setup', 'complete']);
const eventCreationMethodSchema = zod_1.z.enum(['manual', 'plotting_calendar']);
const createEventValidator = {
    validate: (payload) => zod_1.z
        .object({
        org_id: zod_1.z.string().uuid().optional(),
        title: zod_1.z.string().min(3),
        address: zod_1.z.string().trim().min(1).optional().nullable(),
        type: eventTypeSchema,
        event_date: zod_1.z.string().date(),
        start_time: zod_1.z.string().optional().nullable(),
        end_time: zod_1.z.string().optional().nullable(),
        description: zod_1.z.string().optional().nullable(),
        image_url: zod_1.z.string().url().optional().nullable(),
        extra_data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
        status: eventStatusSchema.optional(),
        setup_status: eventSetupStatusSchema.optional(),
        setup_completed_at: zod_1.z.string().datetime().optional().nullable(),
        creation_method: eventCreationMethodSchema.optional(),
        plotting_calendar_id: zod_1.z.string().uuid().optional().nullable(),
        hosting_organization: zod_1.z.string().optional().nullable(),
        visibility: zod_1.z.enum(['internal', 'public']).optional(),
        requested_by_user_id: zod_1.z.string().uuid().optional().nullable(),
        is_public: zod_1.z.boolean().optional(),
    })
        .safeParse(payload),
};
const updateEventValidator = {
    validate: (payload) => zod_1.z
        .object({
        title: zod_1.z.string().min(3).optional(),
        address: zod_1.z.string().trim().min(1).optional().nullable(),
        type: eventTypeSchema.optional(),
        event_date: zod_1.z.string().date().optional(),
        start_time: zod_1.z.string().optional().nullable(),
        end_time: zod_1.z.string().optional().nullable(),
        description: zod_1.z.string().optional().nullable(),
        image_url: zod_1.z.string().url().optional().nullable(),
        extra_data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
        status: eventStatusSchema.optional(),
        setup_status: eventSetupStatusSchema.optional(),
        setup_completed_at: zod_1.z.string().datetime().optional().nullable(),
        creation_method: eventCreationMethodSchema.optional(),
        plotting_calendar_id: zod_1.z.string().uuid().optional().nullable(),
        hosting_organization: zod_1.z.string().optional().nullable(),
        visibility: zod_1.z.enum(['internal', 'public']).optional(),
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
const statusUpdateValidator = {
    validate: (payload) => zod_1.z
        .object({
        status: eventStatusSchema,
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
function requireAuthedOrgUser(req, res) {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
        sendError(res, 401, {
            code: 'UNAUTHORIZED',
            message: 'Active authenticated organization user required.',
        });
        return null;
    }
    return req.user;
}
function getEventId(req) {
    return req.params?.eventId ?? req.params?.id ?? null;
}
async function quickCreateEventController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const actor = toActor(user);
        const result = await eventService.quickCreateEvent(actor, {
            ...(req.body ?? {}),
            org_id: typeof req.body?.org_id === 'string' ? req.body.org_id : user.org_id,
        });
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'EVENT_QUICK_CREATE_FAILED',
                message: result.error?.message ?? 'Failed to quick create event.',
                details: result.error?.details,
            });
            return;
        }
        res.status(201).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'EVENT_QUICK_CREATE_ERROR',
            message: 'Unexpected error while quick creating event.',
            details: error,
        });
    }
}
async function createEventController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const validated = createEventValidator.validate(req.body ?? {});
        if (!validated.success) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid create event payload.',
                details: validated.error.issues,
            });
            return;
        }
        const actor = toActor(user);
        const payload = {
            ...validated.data,
            org_id: validated.data.org_id ?? user.org_id,
            creation_method: validated.data.creation_method ?? 'manual',
            extra_data: validated.data.extra_data ?? {},
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
async function createManualEventController(req, res) {
    return createEventController(req, res);
}
async function getEventsController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const query = req.query ?? {};
        const statusQuery = query.statuses ?? query.status;
        const typeQuery = query.types ?? query.type;
        const filter = {
            org_id: typeof query.org_id === 'string' && query.org_id.trim().length > 0 ? query.org_id : user.org_id,
            statuses: parseStringArray(statusQuery),
            setup_statuses: parseStringArray(query.setup_status ?? query.setup_statuses),
            creation_methods: parseStringArray(query.creation_method ?? query.creation_methods),
            types: parseStringArray(typeQuery),
            from_date: typeof query.from_date === 'string' ? query.from_date : undefined,
            to_date: typeof query.to_date === 'string' ? query.to_date : undefined,
            requested_by_user_id: typeof query.requested_by_user_id === 'string' ? query.requested_by_user_id : undefined,
            include_public: query.include_public === 'true' || query.include_public === true,
            hosting_organization: typeof query.hosting_organization === 'string' ? query.hosting_organization : undefined,
            search: typeof query.search === 'string' ? query.search : undefined,
            limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
            offset: typeof query.offset === 'string' ? Number(query.offset) : undefined,
        };
        const actor = toActor(user);
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
async function completeEventDetailsController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const eventId = getEventId(req);
        if (!eventId) {
            sendError(res, 400, {
                code: 'EVENT_ID_REQUIRED',
                message: 'eventId path parameter is required.',
            });
            return;
        }
        const actor = toActor(user);
        const result = await eventService.completeEventDetails(actor, eventId, req.body ?? {});
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'EVENT_COMPLETE_DETAILS_FAILED',
                message: result.error?.message ?? 'Failed to save event details.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'EVENT_COMPLETE_DETAILS_ERROR',
            message: 'Unexpected error while saving event details.',
            details: error,
        });
    }
}
async function patchEventStatusController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const eventId = getEventId(req);
        if (!eventId) {
            sendError(res, 400, {
                code: 'EVENT_ID_REQUIRED',
                message: 'eventId path parameter is required.',
            });
            return;
        }
        const validated = statusUpdateValidator.validate(req.body ?? {});
        if (!validated.success) {
            sendError(res, 400, {
                code: 'VALIDATION_ERROR',
                message: 'Invalid event status payload.',
                details: validated.error.issues,
            });
            return;
        }
        const result = await eventService.setEventStatus(toActor(user), eventId, validated.data);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'EVENT_STATUS_UPDATE_FAILED',
                message: result.error?.message ?? 'Failed to update event status.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'EVENT_STATUS_UPDATE_ERROR',
            message: 'Unexpected error while updating event status.',
            details: error,
        });
    }
}
async function publishEventController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const eventId = getEventId(req);
        if (!eventId) {
            sendError(res, 400, {
                code: 'EVENT_ID_REQUIRED',
                message: 'eventId path parameter is required.',
            });
            return;
        }
        const result = await eventService.publishEvent(toActor(user), eventId);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'EVENT_PUBLISH_FAILED',
                message: result.error?.message ?? 'Failed to publish event.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'EVENT_PUBLISH_ERROR',
            message: 'Unexpected error while publishing event.',
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
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const eventId = getEventId(req);
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
        const result = await eventService.updateEvent(toActor(user), eventId, validated.data);
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
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const eventId = getEventId(req);
        if (!eventId) {
            sendError(res, 400, {
                code: 'EVENT_ID_REQUIRED',
                message: 'eventId path parameter is required.',
            });
            return;
        }
        const result = await eventService.deleteEvent(toActor(user), eventId);
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
async function deprecatedEventWorkflowController(req, res) {
    void req;
    res.status(410).json({
        success: false,
        error: {
            code: 'EVENT_WORKFLOW_DEPRECATED',
            message: 'Approve, reject, and reschedule review actions are deprecated. Use complete-details, publish, or status updates instead.',
        },
    });
}
