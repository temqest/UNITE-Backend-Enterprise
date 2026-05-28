"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const approval_controller_1 = require("../../controllers/events/approval.controller");
const event_controller_1 = require("../../controllers/events/event.controller");
const operations_controller_1 = require("../../controllers/events/operations.controller");
const participant_controller_1 = require("../../controllers/events/participant.controller");
const event_service_1 = require("../../../../services/events/event.service");
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const auth_middleware_1 = require("../../../../middelware/auth.middleware");
const authorization_middleware_1 = require("../../../../middelware/authorization.middleware");
const validate_middleware_1 = require("../../../../middelware/validate.middleware");
const async_handler_1 = require("../../../../lib/async-handler");
const eventsRouter = (0, express_1.Router)();
exports.eventsRouter = eventsRouter;
const eventService = new event_service_1.EventService(supabase_client_1.supabaseServer);
const passthroughValidator = {
    validate: (payload) => ({ success: true, data: payload }),
};
const eventIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().uuid({ message: 'id must be a valid UUID' }),
});
const participantStatusParamSchema = zod_1.z.object({
    id: zod_1.z.string().uuid({ message: 'id must be a valid UUID' }),
    participantId: zod_1.z.string().uuid({ message: 'participantId must be a valid UUID' }),
});
const eventsListQuerySchema = zod_1.z.object({
    limit: zod_1.z
        .string()
        .regex(/^\d+$/, { message: 'limit must be a positive integer string' })
        .transform((value) => Number.parseInt(value, 10))
        .refine((value) => value >= 1 && value <= 100, { message: 'limit must be between 1 and 100' })
        .optional(),
    offset: zod_1.z
        .string()
        .regex(/^\d+$/, { message: 'offset must be a non-negative integer string' })
        .transform((value) => Number.parseInt(value, 10))
        .optional(),
    status: zod_1.z.string().optional(),
    statuses: zod_1.z.string().optional(),
    setup_status: zod_1.z.string().optional(),
    setup_statuses: zod_1.z.string().optional(),
    creation_method: zod_1.z.string().optional(),
    creation_methods: zod_1.z.string().optional(),
    type: zod_1.z.string().optional(),
    types: zod_1.z.string().optional(),
    from_date: zod_1.z.string().optional(),
    to_date: zod_1.z.string().optional(),
    province: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    hosting_organization: zod_1.z.string().optional(),
    search: zod_1.z.string().optional(),
    include_public: zod_1.z.union([zod_1.z.literal('true'), zod_1.z.literal('false')]).optional(),
    include_archived: zod_1.z.union([zod_1.z.literal('true'), zod_1.z.literal('false')]).optional(),
});
const paramsValidator = {
    validate: (payload) => {
        const parsed = eventIdParamSchema.safeParse(payload);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues };
        }
        return { success: true, data: parsed.data };
    },
};
const participantStatusParamsValidator = {
    validate: (payload) => {
        const parsed = participantStatusParamSchema.safeParse(payload);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues };
        }
        return { success: true, data: parsed.data };
    },
};
const listQueryValidator = {
    validate: (payload) => {
        const parsed = eventsListQuerySchema.safeParse(payload);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues };
        }
        return { success: true, data: parsed.data };
    },
};
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
eventsRouter.post('/quick-create', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.create'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(event_controller_1.quickCreateEventController));
eventsRouter.post('/manual', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.create'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(event_controller_1.createManualEventController));
eventsRouter.post('/', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.create'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(event_controller_1.createEventController));
eventsRouter.get('/public', (0, validate_middleware_1.validateMiddleware)(listQueryValidator, 'query'), (0, async_handler_1.asyncHandler)(event_controller_1.getPublicEventsController));
eventsRouter.get('/', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.read'), (0, validate_middleware_1.validateMiddleware)(listQueryValidator, 'query'), (0, async_handler_1.asyncHandler)(event_controller_1.getEventsController));
eventsRouter.get('/my-events', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.read'), (0, validate_middleware_1.validateMiddleware)(listQueryValidator, 'query'), (0, async_handler_1.asyncHandler)(operations_controller_1.listMyEventsController));
eventsRouter.get('/:id', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.read'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), async (req, res, next) => {
    try {
        if (!req.user?.id || !req.user.org_id || req.user.is_active === false) {
            res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Active authenticated organization user required.',
                },
            });
            return;
        }
        const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const result = await eventService.getEventById(eventId, toActor(req.user));
        if (result.error || !result.data) {
            res.status(404).json({
                success: false,
                error: {
                    code: result.error?.code ?? 'EVENT_NOT_FOUND',
                    message: result.error?.message ?? 'Event not found.',
                    details: result.error?.details,
                },
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        next(error);
    }
});
eventsRouter.get('/:id/stats', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.read'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, async_handler_1.asyncHandler)(operations_controller_1.getEventStatsController));
eventsRouter.patch('/:id/results', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.update'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(operations_controller_1.patchEventResultsController));
eventsRouter.patch('/:id/complete-details', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.update'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(event_controller_1.completeEventDetailsController));
eventsRouter.patch('/:id/status', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.update'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(event_controller_1.patchEventStatusController));
eventsRouter.patch('/:id/publish', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.update'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, async_handler_1.asyncHandler)(event_controller_1.publishEventController));
eventsRouter.patch('/:id/cancel', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.update'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(approval_controller_1.cancelEventController));
eventsRouter.patch('/:id', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.update'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(event_controller_1.updateEventController));
eventsRouter.delete('/:id', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.update'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, async_handler_1.asyncHandler)(event_controller_1.deleteEventController));
eventsRouter.post('/:id/approve', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.approve'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(event_controller_1.deprecatedEventWorkflowController));
eventsRouter.post('/:id/reject', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.approve'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(event_controller_1.deprecatedEventWorkflowController));
eventsRouter.post('/:id/reschedule', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.update'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(event_controller_1.deprecatedEventWorkflowController));
eventsRouter.post('/:id/cancel', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.update'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(approval_controller_1.cancelEventController));
eventsRouter.post('/:id/staff', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.update'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(participant_controller_1.assignStaffController));
eventsRouter.post('/:id/apply', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.read'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(participant_controller_1.applyAsParticipantController));
eventsRouter.patch('/:id/participants/status', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.update'), (0, validate_middleware_1.validateMiddleware)(paramsValidator, 'params'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(participant_controller_1.bulkUpdateParticipantStatusController));
eventsRouter.patch('/:id/participants/:participantId/status', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, authorization_middleware_1.requireOrgScope, (0, authorization_middleware_1.authorize)('events.update'), (0, validate_middleware_1.validateMiddleware)(participantStatusParamsValidator, 'params'), (0, validate_middleware_1.validateMiddleware)(passthroughValidator), (0, async_handler_1.asyncHandler)(participant_controller_1.updateParticipantStatusController));
exports.default = eventsRouter;
