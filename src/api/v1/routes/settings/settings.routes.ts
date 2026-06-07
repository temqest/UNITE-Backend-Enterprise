import { Router } from 'express';
import {
  getOrganizationSettingsController,
  getUserSettingsController,
  updateOrganizationSettingsController,
  updateUserSettingsController,
  verifyFeaturePinController,
} from '../../controllers/users/settings.controller';
import { validateSettingsUpdate } from '../../validators/users';
import { authMiddleware } from '../../../../middelware/auth.middleware';
import { authorize, requireActiveUser, requireOrgScope } from '../../../../middelware/authorization.middleware';
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

settingsRouter.get('/organization', authMiddleware, requireActiveUser, requireOrgScope, authorize('settings.read'), validateMiddleware(passthroughValidator), asyncHandler(getOrganizationSettingsController as any));
settingsRouter.patch('/organization', authMiddleware, requireActiveUser, requireOrgScope, authorize('settings.update'), validateMiddleware(passthroughValidator), asyncHandler(updateOrganizationSettingsController as any));
settingsRouter.post('/organization/verify-pin', authMiddleware, requireActiveUser, requireOrgScope, validateMiddleware(passthroughValidator), asyncHandler(verifyFeaturePinController as any));
settingsRouter.get('/user', authMiddleware, requireActiveUser, validateMiddleware(passthroughValidator), asyncHandler(getUserSettingsController as any));
settingsRouter.patch('/user', authMiddleware, requireActiveUser, validateMiddleware(toValidator(validateSettingsUpdate)), asyncHandler(updateUserSettingsController as any));

export { settingsRouter };
export default settingsRouter;
