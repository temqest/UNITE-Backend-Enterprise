import { Router } from 'express';
import { joinWaitlistController } from '../../controllers/waitlist/waitlist.controller';
import { publicFormRateLimiter } from '../../../../middelware/rate-limit.middleware';

const router = Router();

router.post('/', publicFormRateLimiter, joinWaitlistController);

export { router as waitlistRouter };
export default router;
