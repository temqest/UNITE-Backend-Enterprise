import { Router } from 'express';
import { asyncHandler } from '../../../../lib/async-handler';
import { authMiddleware } from '../../../../middelware/auth.middleware';
import { requireActiveUser, requireOrgScope, requireRole } from '../../../../middelware/authorization.middleware';
import { getActivityLogs } from '../../controllers/activity-logs/activity-logs.controller';

const router = Router();

// Apply auth and permission checks
router.use(authMiddleware);
router.use(requireActiveUser);
router.use(requireOrgScope);
router.use(requireRole('admin', 'super_admin')); 

router.get('/', asyncHandler(getActivityLogs));

export { router as activityLogsRouter };
export default router;
