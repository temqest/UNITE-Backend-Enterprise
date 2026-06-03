"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plottingCalendarsShareRouter = void 0;
const express_1 = require("express");
const plotting_calendar_share_controller_1 = require("../../controllers/events/plotting-calendar-share.controller");
const async_handler_1 = require("../../../../lib/async-handler");
const plottingCalendarsShareRouter = (0, express_1.Router)();
exports.plottingCalendarsShareRouter = plottingCalendarsShareRouter;
// Public routes for share-link plotting calendars
plottingCalendarsShareRouter.get('/:shareToken', (0, async_handler_1.asyncHandler)(plotting_calendar_share_controller_1.getSharedPlottingCalendarController));
plottingCalendarsShareRouter.post('/:shareToken/verify-access', (0, async_handler_1.asyncHandler)(plotting_calendar_share_controller_1.verifySharedPlottingCalendarAccessController));
plottingCalendarsShareRouter.get('/:shareToken/available-slots', (0, async_handler_1.asyncHandler)(plotting_calendar_share_controller_1.getSharedPlottingCalendarAvailableSlotsController));
plottingCalendarsShareRouter.post('/:shareToken/plot-event', (0, async_handler_1.asyncHandler)(plotting_calendar_share_controller_1.plotEventFromSharedCalendarController));
exports.default = plottingCalendarsShareRouter;
