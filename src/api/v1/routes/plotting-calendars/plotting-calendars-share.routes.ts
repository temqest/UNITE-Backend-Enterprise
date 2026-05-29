import { Router } from 'express';
import {
  getSharedPlottingCalendarController,
  getSharedPlottingCalendarAvailableSlotsController,
  plotEventFromSharedCalendarController,
} from '../../controllers/events/plotting-calendar-share.controller';
import { asyncHandler } from '../../../../lib/async-handler';

const plottingCalendarsShareRouter = Router();

// Public routes for share-link plotting calendars
plottingCalendarsShareRouter.get('/:shareToken', asyncHandler(getSharedPlottingCalendarController as any));
plottingCalendarsShareRouter.get('/:shareToken/available-slots', asyncHandler(getSharedPlottingCalendarAvailableSlotsController as any));
plottingCalendarsShareRouter.post('/:shareToken/plot-event', asyncHandler(plotEventFromSharedCalendarController as any));

export { plottingCalendarsShareRouter };
export default plottingCalendarsShareRouter;
