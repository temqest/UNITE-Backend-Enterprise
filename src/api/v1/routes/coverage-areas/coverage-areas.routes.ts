import { Router } from 'express';
import { asyncHandler } from '../../../../lib/async-handler';
import { authMiddleware } from '../../../../middelware/auth.middleware';
import { authorize, requireActiveUser, requireOrgScope } from '../../../../middelware/authorization.middleware';
import { validateMiddleware as validate } from '../../../../middelware/validate.middleware';
import * as controller from '../../controllers/coverage-areas/coverage-areas.controller';
import * as validators from '../../validators/coverage-areas/coverage-areas.validators';

const router = Router();

router.use(authMiddleware);
router.use(requireActiveUser);
router.use(requireOrgScope);

router.get(
  '/',
  authorize('coverage.read'),
  validate(validators.listCoverageAreasQuerySchema),
  asyncHandler(controller.listCoverageAreas)
);

router.get(
  '/:id',
  authorize('coverage.read'),
  asyncHandler(controller.getCoverageArea)
);

router.post(
  '/',
  authorize('coverage.create'),
  validate(validators.createCoverageAreaSchema),
  asyncHandler(controller.createCoverageArea)
);

router.patch(
  '/:id',
  authorize('coverage.update'),
  validate(validators.updateCoverageAreaSchema),
  asyncHandler(controller.updateCoverageArea)
);

router.delete(
  '/:id',
  authorize('coverage.delete'),
  asyncHandler(controller.deleteCoverageArea)
);

export { router as coverageAreasRouter };
