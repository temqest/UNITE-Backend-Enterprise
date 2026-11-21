import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { approveStaffController } from '../../controllers/users/approval.controller';
import { getProfileController, updateProfileController } from '../../controllers/users/profile.controller';
import { updateUserSettingsController } from '../../controllers/users/settings.controller';
import {
  createStaffManagementController,
  deleteStaffManagementController,
  listStaffController,
  updateStaffManagementController,
} from '../../controllers/users/staff-management.controller';
import { getStaffDetailController } from '../../controllers/users/staff-detail.controller';
import { uploadProfilePictureController, deleteProfilePictureController } from '../../controllers/users/profile-picture.controller';
import { signupAdminController, signupStaffController, signupDonorController } from '../../controllers/users/signup.controller';
import {
  validateGetProfile,
  validateProfileUpdate,
  validateStaffCreate,
  validateStaffListQuery,
  validateSettingsUpdate,
  validateSignup,
  validateStaffApproval,
  validateStaffUpdate,
  validateUserIdParam,
} from '../../validators/users';
import { authMiddleware } from '../../../../middelware/auth.middleware';
import { authorize, authorizeOrSelf, requireActiveUser, requireOrgScope } from '../../../../middelware/authorization.middleware';
import { authSignupRateLimiter } from '../../../../middelware/rate-limit.middleware';
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

const usersRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

const profilePictureRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many profile picture uploads from this IP, please try again after 15 minutes.',
    },
  },
});

usersRouter.post('/signup', authSignupRateLimiter, validateMiddleware(toValidator(validateSignup)), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = typeof req.body?.role === 'string' ? req.body.role.toLowerCase() : '';
    const hasOrganization = Boolean(req.body?.organization);

    if (role === 'admin' || hasOrganization) {
      await signupAdminController(req, res);
      return;
    }

    if (role === 'donor') {
      await signupDonorController(req, res);
      return;
    }

    await signupStaffController(req, res);
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/profile', authMiddleware, requireActiveUser, requireOrgScope, validateMiddleware(toValidator(validateGetProfile)), asyncHandler(getProfileController as any));
usersRouter.patch('/profile', authMiddleware, requireActiveUser, requireOrgScope, validateMiddleware(toValidator(validateProfileUpdate)), asyncHandler(updateProfileController as any));
usersRouter.post('/approve-staff', authMiddleware, requireActiveUser, requireOrgScope, authorize('users.approve'), validateMiddleware(toValidator(validateStaffApproval)), asyncHandler(approveStaffController as any));
usersRouter.patch('/settings', authMiddleware, requireActiveUser, requireOrgScope, authorize('settings.update'), validateMiddleware(toValidator(validateSettingsUpdate)), asyncHandler(updateUserSettingsController as any));
usersRouter.get('/', authMiddleware, requireActiveUser, requireOrgScope, authorize('staff.read'), validateMiddleware(toValidator(validateStaffListQuery), 'query'), asyncHandler(listStaffController as any));
usersRouter.post('/', authMiddleware, requireActiveUser, requireOrgScope, authorize('users.invite'), validateMiddleware(toValidator(validateStaffCreate)), asyncHandler(createStaffManagementController as any));
usersRouter.get('/:id/detail', authMiddleware, requireActiveUser, requireOrgScope, authorizeOrSelf('staff.read'), validateMiddleware(toValidator(validateUserIdParam), 'params'), asyncHandler(getStaffDetailController as any));
usersRouter.patch('/:id', authMiddleware, requireActiveUser, requireOrgScope, authorizeOrSelf('users.invite'), validateMiddleware(toValidator(validateUserIdParam), 'params'), validateMiddleware(toValidator(validateStaffUpdate)), asyncHandler(updateStaffManagementController as any));
usersRouter.delete('/:id', authMiddleware, requireActiveUser, requireOrgScope, authorize('users.invite'), validateMiddleware(toValidator(validateUserIdParam), 'params'), asyncHandler(deleteStaffManagementController as any));

usersRouter.post('/:id/profile-picture', profilePictureRateLimiter, authMiddleware, requireActiveUser, requireOrgScope, validateMiddleware(toValidator(validateUserIdParam), 'params'), upload.single('profile_picture'), asyncHandler(uploadProfilePictureController as any));
usersRouter.delete('/:id/profile-picture', authMiddleware, requireActiveUser, requireOrgScope, validateMiddleware(toValidator(validateUserIdParam), 'params'), asyncHandler(deleteProfilePictureController as any));

export { usersRouter };
export default usersRouter;
