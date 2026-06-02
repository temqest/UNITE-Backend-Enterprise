"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPlottingCalendarsController = listPlottingCalendarsController;
exports.getPlottingCalendarController = getPlottingCalendarController;
exports.createPlottingCalendarController = createPlottingCalendarController;
exports.updatePlottingCalendarController = updatePlottingCalendarController;
exports.deletePlottingCalendarController = deletePlottingCalendarController;
exports.regeneratePlottingCalendarAccessCodeController = regeneratePlottingCalendarAccessCodeController;
exports.getPlottingCalendarAvailableSlotsController = getPlottingCalendarAvailableSlotsController;
exports.getPlottingCalendarAvailabilityController = getPlottingCalendarAvailabilityController;
exports.savePlottingCalendarAvailabilityController = savePlottingCalendarAvailabilityController;
exports.plotEventFromCalendarController = plotEventFromCalendarController;
const plotting_calendar_service_1 = require("../../../../services/events/plotting-calendar.service");
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const plottingCalendarService = new plotting_calendar_service_1.PlottingCalendarService(supabase_client_1.supabaseServer);
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
function isPlottingCalendarAccessTypeConstraintViolation(error) {
    return error?.code === 'PLOTTING_CALENDAR_ACCESS_TYPE_CONSTRAINT_VIOLATION';
}
function logPlottingCalendarConstraintViolation(action, error) {
    if (process.env.NODE_ENV === 'production') {
        return;
    }
    const candidate = error;
    console.warn('[plotting-calendars] access type constraint violation', {
        action,
        code: candidate?.code,
        message: candidate?.message,
        dbCode: candidate?.details?.code,
        dbMessage: candidate?.details?.message,
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
function parseStringArray(input) {
    if (Array.isArray(input)) {
        return input.filter((item) => typeof item === 'string');
    }
    if (typeof input === 'string') {
        return input.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return undefined;
}
async function listPlottingCalendarsController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const query = req.query ?? {};
        const filter = {
            org_id: typeof query.org_id === 'string' ? query.org_id : user.org_id,
            statuses: parseStringArray(query.status ?? query.statuses),
            search: typeof query.search === 'string' ? query.search : undefined,
            limit: typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : undefined,
            offset: typeof query.offset === 'string' ? Number.parseInt(query.offset, 10) : undefined,
        };
        const result = await plottingCalendarService.listCalendars(toActor(user), filter);
        if (result.error || !result.data) {
            sendError(res, 400, result.error?.code ?? 'PLOTTING_CALENDAR_LIST_FAILED', result.error?.message ?? 'Failed to list plotting calendars.', result.error?.details);
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, 'PLOTTING_CALENDAR_LIST_ERROR', 'Unexpected error while listing plotting calendars.', error);
    }
}
async function getPlottingCalendarController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const calendarId = req.params?.id;
        if (!calendarId) {
            sendError(res, 400, 'PLOTTING_CALENDAR_ID_REQUIRED', 'id path parameter is required.');
            return;
        }
        const result = await plottingCalendarService.getCalendar(toActor(user), calendarId);
        if (result.error || !result.data) {
            sendError(res, 404, result.error?.code ?? 'PLOTTING_CALENDAR_NOT_FOUND', result.error?.message ?? 'Plotting calendar not found.', result.error?.details);
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, 'PLOTTING_CALENDAR_GET_ERROR', 'Unexpected error while fetching plotting calendar.', error);
    }
}
async function createPlottingCalendarController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const payload = {
            ...(req.body ?? {}),
            org_id: typeof req.body?.org_id === 'string' ? req.body.org_id : user.org_id,
        };
        const result = await plottingCalendarService.createCalendar(toActor(user), payload);
        if (result.error || !result.data) {
            if (isPlottingCalendarAccessTypeConstraintViolation(result.error)) {
                logPlottingCalendarConstraintViolation('create', result.error);
            }
            sendError(res, 400, result.error?.code ?? 'PLOTTING_CALENDAR_CREATE_FAILED', isPlottingCalendarAccessTypeConstraintViolation(result.error)
                ? 'Failed to create plotting calendar.'
                : result.error?.message ?? 'Failed to create plotting calendar.', result.error?.details);
            return;
        }
        res.status(201).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, 'PLOTTING_CALENDAR_CREATE_ERROR', 'Unexpected error while creating plotting calendar.', error);
    }
}
async function updatePlottingCalendarController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const calendarId = req.params?.id;
        if (!calendarId) {
            sendError(res, 400, 'PLOTTING_CALENDAR_ID_REQUIRED', 'id path parameter is required.');
            return;
        }
        const result = await plottingCalendarService.updateCalendar(toActor(user), calendarId, (req.body ?? {}));
        if (result.error || !result.data) {
            if (isPlottingCalendarAccessTypeConstraintViolation(result.error)) {
                logPlottingCalendarConstraintViolation('update', result.error);
            }
            sendError(res, 400, result.error?.code ?? 'PLOTTING_CALENDAR_UPDATE_FAILED', isPlottingCalendarAccessTypeConstraintViolation(result.error)
                ? 'Failed to update plotting calendar.'
                : result.error?.message ?? 'Failed to update plotting calendar.', result.error?.details);
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, 'PLOTTING_CALENDAR_UPDATE_ERROR', 'Unexpected error while updating plotting calendar.', error);
    }
}
async function deletePlottingCalendarController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const calendarId = req.params?.id;
        if (!calendarId) {
            sendError(res, 400, 'PLOTTING_CALENDAR_ID_REQUIRED', 'id path parameter is required.');
            return;
        }
        const result = await plottingCalendarService.deleteCalendar(toActor(user), calendarId);
        if (result.error) {
            sendError(res, 400, result.error.code, result.error.message, result.error.details);
            return;
        }
        res.status(200).json({ success: true, data: null });
    }
    catch (error) {
        sendError(res, 500, 'PLOTTING_CALENDAR_DELETE_ERROR', 'Unexpected error while deleting plotting calendar.', error);
    }
}
async function regeneratePlottingCalendarAccessCodeController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const calendarId = req.params?.id;
        if (!calendarId) {
            sendError(res, 400, 'PLOTTING_CALENDAR_ID_REQUIRED', 'id path parameter is required.');
            return;
        }
        const result = await plottingCalendarService.regenerateAccessCode(toActor(user), calendarId);
        if (result.error || !result.data) {
            sendError(res, 400, result.error?.code ?? 'PLOTTING_CALENDAR_REGENERATE_FAILED', result.error?.message ?? 'Failed to regenerate access code.', result.error?.details);
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, 'PLOTTING_CALENDAR_REGENERATE_ERROR', 'Unexpected error while regenerating access code.', error);
    }
}
async function getPlottingCalendarAvailableSlotsController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const calendarId = req.params?.id;
        if (!calendarId) {
            sendError(res, 400, 'PLOTTING_CALENDAR_ID_REQUIRED', 'id path parameter is required.');
            return;
        }
        const result = await plottingCalendarService.getAvailableSlots(toActor(user), calendarId);
        if (result.error || !result.data) {
            sendError(res, 400, result.error?.code ?? 'PLOTTING_CALENDAR_SLOTS_FAILED', result.error?.message ?? 'Failed to calculate available slots.', result.error?.details);
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, 'PLOTTING_CALENDAR_SLOTS_ERROR', 'Unexpected error while fetching available slots.', error);
    }
}
async function getPlottingCalendarAvailabilityController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const calendarId = req.params?.id;
        if (!calendarId) {
            sendError(res, 400, 'PLOTTING_CALENDAR_ID_REQUIRED', 'id path parameter is required.');
            return;
        }
        const result = await plottingCalendarService.getAvailability(toActor(user), calendarId, {
            from: typeof req.query?.from === 'string' ? req.query.from : undefined,
            to: typeof req.query?.to === 'string' ? req.query.to : undefined,
        });
        if (result.error || !result.data) {
            sendError(res, 400, result.error?.code ?? 'PLOTTING_AVAILABILITY_FAILED', result.error?.message ?? 'Failed to load availability.', result.error?.details);
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, 'PLOTTING_AVAILABILITY_ERROR', 'Unexpected error while fetching availability.', error);
    }
}
async function savePlottingCalendarAvailabilityController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const calendarId = req.params?.id;
        if (!calendarId) {
            sendError(res, 400, 'PLOTTING_CALENDAR_ID_REQUIRED', 'id path parameter is required.');
            return;
        }
        const result = await plottingCalendarService.upsertAvailability(toActor(user), calendarId, (req.body ?? {}));
        if (result.error || !result.data) {
            sendError(res, 400, result.error?.code ?? 'PLOTTING_AVAILABILITY_SAVE_FAILED', result.error?.message ?? 'Failed to save availability.', result.error?.details);
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, 'PLOTTING_AVAILABILITY_SAVE_ERROR', 'Unexpected error while saving availability.', error);
    }
}
async function plotEventFromCalendarController(req, res) {
    try {
        const user = requireAuthedOrgUser(req, res);
        if (!user)
            return;
        const calendarId = req.params?.id;
        if (!calendarId) {
            sendError(res, 400, 'PLOTTING_CALENDAR_ID_REQUIRED', 'id path parameter is required.');
            return;
        }
        const result = await plottingCalendarService.plotEvent(toActor(user), calendarId, req.body ?? {});
        if (result.error || !result.data) {
            sendError(res, 400, result.error?.code ?? 'PLOT_EVENT_FAILED', result.error?.message ?? 'Failed to plot event.', result.error?.details);
            return;
        }
        res.status(201).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, 'PLOT_EVENT_ERROR', 'Unexpected error while plotting event.', error);
    }
}
