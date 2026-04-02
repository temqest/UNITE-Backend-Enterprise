import { Router } from 'express';
import {
  activateDonorAccountController,
  applyDonorToEventController,
  donorSignupController,
  getDonorDashboardController,
  getDonorProfileController,
  listPublicDonorEventsController,
  updateDonorProfileController,
} from '../../controllers/donor/donor.controller';
import { authMiddleware } from '../../../../middelware/auth.middleware';
import { requireActiveUser } from '../../../../middelware/authorization.middleware';
import { asyncHandler } from '../../../../lib/async-handler';

const donorRouter = Router();

donorRouter.post('/signup', asyncHandler(donorSignupController as any));
donorRouter.get('/events', asyncHandler(listPublicDonorEventsController as any));
donorRouter.post('/activate', authMiddleware, requireActiveUser, asyncHandler(activateDonorAccountController as any));
donorRouter.get('/dashboard', authMiddleware, requireActiveUser, asyncHandler(getDonorDashboardController as any));
donorRouter.get('/profile', authMiddleware, requireActiveUser, asyncHandler(getDonorProfileController as any));
donorRouter.patch('/profile', authMiddleware, requireActiveUser, asyncHandler(updateDonorProfileController as any));
donorRouter.post('/events/:id/apply', authMiddleware, requireActiveUser, asyncHandler(applyDonorToEventController as any));

export { donorRouter };
export default donorRouter;
