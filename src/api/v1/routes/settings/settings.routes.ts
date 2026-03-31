import { Router } from 'express';
import {
  getOrganizationSettingsController,
  getUserSettingsController,
  updateOrganizationSettingsController,
  updateUserSettingsController,
} from '../../controllers/users/settings.controller';
import { validateSettingsUpdate } from '../../validators/users';
import { authMiddleware } from '../../../../middelware/auth.middleware';
import { validateMiddleware } from '../../../../middelware/validate.middleware';
import { asyncHandler } from '../../../../lib/async-handler';

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

const passthroughValidator = {
  validate: (payload: unknown): ValidationResult => ({ success: true, data: payload }),
};

const settingsRouter = Router();

settingsRouter.get('/organization', authMiddleware, validateMiddleware(passthroughValidator), asyncHandler(getOrganizationSettingsController as any));
settingsRouter.patch('/organization', authMiddleware, validateMiddleware(passthroughValidator), asyncHandler(updateOrganizationSettingsController as any));
settingsRouter.get('/user', authMiddleware, validateMiddleware(passthroughValidator), asyncHandler(getUserSettingsController as any));
settingsRouter.patch('/user', authMiddleware, validateMiddleware(toValidator(validateSettingsUpdate)), asyncHandler(updateUserSettingsController as any));

export { settingsRouter };
export default settingsRouter;
