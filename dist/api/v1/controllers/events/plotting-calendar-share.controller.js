"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSharedPlottingCalendarController = getSharedPlottingCalendarController;
exports.getSharedPlottingCalendarAvailableSlotsController = getSharedPlottingCalendarAvailableSlotsController;
exports.plotEventFromSharedCalendarController = plotEventFromSharedCalendarController;
const plotting_calendar_share_service_1 = require("../../../../services/events/plotting-calendar-share.service");
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const plottingCalendarShareService = new plotting_calendar_share_service_1.PlottingCalendarShareService(supabase_client_1.supabaseServer);
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
async function getSharedPlottingCalendarController(req, res) {
    try {
        const shareToken = req.params?.shareToken;
        if (!shareToken) {
            sendError(res, 400, 'SHARE_TOKEN_REQUIRED', 'shareToken path parameter is required.');
            return;
        }
        const result = await plottingCalendarShareService.getSharedCalendar(shareToken);
        if (result.error || !result.data) {
            sendError(res, 404, result.error?.code ?? 'PLOTTING_CALENDAR_NOT_FOUND', result.error?.message ?? 'Plotting calendar not found.', result.error?.details);
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, 'PLOTTING_CALENDAR_GET_ERROR', 'Unexpected error while fetching shared plotting calendar.', error);
    }
}
async function getSharedPlottingCalendarAvailableSlotsController(req, res) {
    try {
        const shareToken = req.params?.shareToken;
        if (!shareToken) {
            sendError(res, 400, 'SHARE_TOKEN_REQUIRED', 'shareToken path parameter is required.');
            return;
        }
        const date = typeof req.query?.date === 'string' ? req.query.date : undefined;
        const result = await plottingCalendarShareService.getSharedCalendarAvailableSlots(shareToken, date);
        if (result.error || !result.data) {
            sendError(res, 400, result.error?.code ?? 'PLOTTING_CALENDAR_SLOTS_FAILED', result.error?.message ?? 'Failed to calculate available slots.', result.error?.details);
            return;
        }
        // For public viewer, let's only return the day that was requested, or the whole availability structure.
        // The internal service returns a list of days.
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, 'PLOTTING_CALENDAR_SLOTS_ERROR', 'Unexpected error while fetching available slots.', error);
    }
}
async function plotEventFromSharedCalendarController(req, res) {
    try {
        const shareToken = req.params?.shareToken;
        if (!shareToken) {
            sendError(res, 400, 'SHARE_TOKEN_REQUIRED', 'shareToken path parameter is required.');
            return;
        }
        const result = await plottingCalendarShareService.plotEventPublic(shareToken, req.body ?? {});
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
