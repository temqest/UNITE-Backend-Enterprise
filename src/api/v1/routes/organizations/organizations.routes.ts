import { Router } from 'express';
import { asyncHandler } from '../../../../lib/async-handler';
import { validateMiddleware } from '../../../../middelware/validate.middleware';
import { lookupOrganizationByCodeController } from '../../controllers/organizations/lookup.controller';
import { validateLookupOrganizationCode } from '../../validators/organizations/lookup.validator';

type ValidationResult =
  | { success: true; data: unknown }
  | { success: false; error: unknown };

function toValidator(validateFn: (payload: unknown) => unknown): { validate: (payload: unknown) => ValidationResult } {
  return {
    validate: (payload: unknown): ValidationResult => {
      const result = validateFn(payload) as
        | { success?: boolean; data?: unknown; error?: unknown }
        | null
        | undefined;

      if (result && typeof result === 'object' && typeof result.success === 'boolean') {
        return result.success
          ? { success: true, data: result.data }
          : { success: false, error: result.error };
      }

      if (result && typeof result === 'object' && 'error' in result) {
        return result.error
          ? { success: false, error: result.error }
          : { success: true, data: result.data };
      }

      return { success: true, data: result };
    },
  };
}

const organizationsRouter = Router();

organizationsRouter.get(
  '/lookup',
  validateMiddleware(toValidator(validateLookupOrganizationCode), 'query'),
  asyncHandler(lookupOrganizationByCodeController as any)
);

export { organizationsRouter };
export default organizationsRouter;

