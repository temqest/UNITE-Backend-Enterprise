import { Router } from 'express';
import { AnalyticsController } from '../../controllers/analytics/analytics.controller';
import { authMiddleware } from '../../../../middelware/auth.middleware';
import { authorize, requireActiveUser, requireOrgScope } from '../../../../middelware/authorization.middleware';
import { asyncHandler } from '../../../../lib/async-handler';

const router = Router();
const analyticsController = new AnalyticsController();

// Use events.read for now as temporary fallback if analytics.read is not configured
router.get(
  '/dashboard',
  authMiddleware,
  requireActiveUser,
  requireOrgScope,
  authorize('events.read'),
  asyncHandler(analyticsController.getDashboard.bind(analyticsController))
);

export const analyticsRoutes = router;
