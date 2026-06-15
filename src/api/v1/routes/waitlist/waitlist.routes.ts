import { Router } from 'express';
import { joinWaitlistController } from '../../controllers/waitlist/waitlist.controller';

const router = Router();

router.post('/', joinWaitlistController);

export { router as waitlistRouter };
export default router;
