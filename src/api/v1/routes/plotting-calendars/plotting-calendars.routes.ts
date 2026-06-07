import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  createPlottingCalendarController,
  deletePlottingCalendarController,
  getPlottingCalendarAvailabilityController,
  getPlottingCalendarAvailableSlotsController,
  getPlottingCalendarController,
  listPlottingCalendarsController,
  plotEventFromCalendarController,
  savePlottingCalendarAvailabilityController,
  updatePlottingCalendarController,
  regeneratePlottingCalendarAccessCodeController,
} from '../../controllers/events/plotting-calendar.controller';
import { authMiddleware } from '../../../../middelware/auth.middleware';
import { authorize, requireActiveUser, requireOrgScope } from '../../../../middelware/authorization.middleware';
import { asyncHandler } from '../../../../lib/async-handler';
import { plottingCalendarsShareRouter } from './plotting-calendars-share.routes';

interface UserRole {
  type?: string;
  permissions?: string[];
}

interface AuthenticatedUser {
  id: string;
  org_id?: string;
  role?: UserRole;
  geographic_area?: Record<string, unknown> | null;
  is_active?: boolean;
}

type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

const forbidRoles = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (req.user?.role?.type && roles.includes(req.user.role.type)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied for your role.',
        },
      });
      return;
    }
    next();
  };
};

const plottingCalendarsRouter = Router();

// Mount public share routes
plottingCalendarsRouter.use('/share', plottingCalendarsShareRouter);

plottingCalendarsRouter.get('/', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.read'), asyncHandler(listPlottingCalendarsController as any));
plottingCalendarsRouter.get('/:id', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.read'), asyncHandler(getPlottingCalendarController as any));
plottingCalendarsRouter.post('/', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.create'), forbidRoles(['stakeholder', 'volunteer']), asyncHandler(createPlottingCalendarController as any));
plottingCalendarsRouter.patch('/:id', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.update'), asyncHandler(updatePlottingCalendarController as any));
plottingCalendarsRouter.post('/:id/regenerate-access-code', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.update'), asyncHandler(regeneratePlottingCalendarAccessCodeController as any));
plottingCalendarsRouter.delete('/:id', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.delete'), asyncHandler(deletePlottingCalendarController as any));
plottingCalendarsRouter.get('/:id/availability', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.read'), asyncHandler(getPlottingCalendarAvailabilityController as any));
plottingCalendarsRouter.put('/:id/availability', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.update'), asyncHandler(savePlottingCalendarAvailabilityController as any));
plottingCalendarsRouter.get('/:id/available-slots', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.read'), asyncHandler(getPlottingCalendarAvailableSlotsController as any));
plottingCalendarsRouter.post('/:id/plot-event', authMiddleware, requireActiveUser, requireOrgScope, authorize('events.create'), asyncHandler(plotEventFromCalendarController as any));

export { plottingCalendarsRouter };
export default plottingCalendarsRouter;
