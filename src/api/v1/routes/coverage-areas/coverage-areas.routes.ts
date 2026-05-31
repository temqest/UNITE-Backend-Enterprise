import { Router } from 'express';
import { asyncHandler } from '../../../../lib/async-handler';
import { authMiddleware } from '../../../../middelware/auth.middleware';
import { authorize, requireActiveUser, requireOrgScope } from '../../../../middelware/authorization.middleware';
import { validateMiddleware as validate } from '../../../../middelware/validate.middleware';
import * as controller from '../../controllers/coverage-areas/coverage-areas.controller';
import * as validators from '../../validators/coverage-areas/coverage-areas.validators';
import { z } from 'zod';

type ValidationResult =
  | { success: true; data: unknown }
  | { success: false; error: unknown };

function schemaValidator(schema: z.ZodTypeAny): { validate: (payload: unknown) => ValidationResult } {
  return {
    validate: (payload: unknown): ValidationResult => {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues };
      }
      return { success: true, data: parsed.data };
    },
  };
}

const router = Router();

router.use(authMiddleware);
router.use(requireActiveUser);
router.use(requireOrgScope);

router.get(
  '/',
  authorize('coverage.read'),
  validate(schemaValidator(validators.listCoverageAreasQuerySchema), 'query'),
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
  validate(schemaValidator(validators.createCoverageAreaSchema)),
  asyncHandler(controller.createCoverageArea)
);

router.patch(
  '/:id',
  authorize('coverage.update'),
  validate(schemaValidator(validators.updateCoverageAreaSchema)),
  asyncHandler(controller.updateCoverageArea)
);

router.delete(
  '/:id',
  authorize('coverage.delete'),
  asyncHandler(controller.deleteCoverageArea)
);

router.post(
  '/:id/reconcile-events',
  authorize('coverage.update'),
  asyncHandler(controller.reconcileEvents)
);

export { router as coverageAreasRouter };
