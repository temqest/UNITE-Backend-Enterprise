import { Router } from 'express';
import { loginController } from '../../controllers/auth/login.controller';
import { logoutController } from '../../controllers/auth/logout.controller';
import { meController } from '../../controllers/auth/me.controller';
import { refreshController } from '../../controllers/auth/refresh.controller';
import { completeGoogleSignupController, exchangeGoogleSessionController } from '../../controllers/auth/google.controller';
import { resendOtpController } from '../../controllers/auth/resend-otp.controller';
import { verifyOtpController } from '../../controllers/auth/verify-otp.controller';
import { changePasswordController, forgotPasswordController } from '../../controllers/auth/password.controller';
import { validateChangePassword, validateForgotPassword, validateLogin, validateResendOtp, validateVerifyOtp } from '../../validators/auth';
import { authMiddleware } from '../../../../middelware/auth.middleware';
import { requireActiveUser } from '../../../../middelware/authorization.middleware';
import { authLoginRateLimiter, authOtpRateLimiter, authForgotPasswordRateLimiter } from '../../../../middelware/rate-limit.middleware';
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

const authRouter = Router();

authRouter.post('/login', authLoginRateLimiter, validateMiddleware(toValidator(validateLogin)), asyncHandler(loginController as any));
authRouter.post('/refresh', asyncHandler(refreshController as any));
authRouter.post('/google/exchange', authLoginRateLimiter, asyncHandler(exchangeGoogleSessionController as any));
authRouter.post('/google/complete-signup', authLoginRateLimiter, asyncHandler(completeGoogleSignupController as any));
authRouter.post('/verify-otp', authOtpRateLimiter, validateMiddleware(toValidator(validateVerifyOtp)), asyncHandler(verifyOtpController as any));
authRouter.post('/resend-otp', authOtpRateLimiter, validateMiddleware(toValidator(validateResendOtp)), asyncHandler(resendOtpController as any));
authRouter.post('/forgot-password', authForgotPasswordRateLimiter, validateMiddleware(toValidator(validateForgotPassword)), asyncHandler(forgotPasswordController as any));
authRouter.get('/me', authMiddleware, requireActiveUser, asyncHandler(meController as any));
authRouter.post('/logout', asyncHandler(logoutController as any));
authRouter.post('/change-password', authMiddleware, requireActiveUser, validateMiddleware(toValidator(validateChangePassword)), asyncHandler(changePasswordController as any));

export { authRouter };
export default authRouter;
