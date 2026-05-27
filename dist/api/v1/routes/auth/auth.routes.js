"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const login_controller_1 = require("../../controllers/auth/login.controller");
const logout_controller_1 = require("../../controllers/auth/logout.controller");
const me_controller_1 = require("../../controllers/auth/me.controller");
const refresh_controller_1 = require("../../controllers/auth/refresh.controller");
const google_controller_1 = require("../../controllers/auth/google.controller");
const resend_otp_controller_1 = require("../../controllers/auth/resend-otp.controller");
const verify_otp_controller_1 = require("../../controllers/auth/verify-otp.controller");
const password_controller_1 = require("../../controllers/auth/password.controller");
const auth_1 = require("../../validators/auth");
const auth_middleware_1 = require("../../../../middelware/auth.middleware");
const authorization_middleware_1 = require("../../../../middelware/authorization.middleware");
const rate_limit_middleware_1 = require("../../../../middelware/rate-limit.middleware");
const validate_middleware_1 = require("../../../../middelware/validate.middleware");
const async_handler_1 = require("../../../../lib/async-handler");
function toValidator(validateFn) {
    return {
        validate: (payload) => {
            const result = validateFn(payload);
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
const authRouter = (0, express_1.Router)();
exports.authRouter = authRouter;
authRouter.post('/login', rate_limit_middleware_1.authLoginRateLimiter, (0, validate_middleware_1.validateMiddleware)(toValidator(auth_1.validateLogin)), (0, async_handler_1.asyncHandler)(login_controller_1.loginController));
authRouter.post('/refresh', (0, async_handler_1.asyncHandler)(refresh_controller_1.refreshController));
authRouter.post('/google/exchange', rate_limit_middleware_1.authLoginRateLimiter, (0, async_handler_1.asyncHandler)(google_controller_1.exchangeGoogleSessionController));
authRouter.post('/google/complete-signup', rate_limit_middleware_1.authLoginRateLimiter, (0, async_handler_1.asyncHandler)(google_controller_1.completeGoogleSignupController));
authRouter.post('/verify-otp', rate_limit_middleware_1.authOtpRateLimiter, (0, validate_middleware_1.validateMiddleware)(toValidator(auth_1.validateVerifyOtp)), (0, async_handler_1.asyncHandler)(verify_otp_controller_1.verifyOtpController));
authRouter.post('/resend-otp', rate_limit_middleware_1.authOtpRateLimiter, (0, validate_middleware_1.validateMiddleware)(toValidator(auth_1.validateResendOtp)), (0, async_handler_1.asyncHandler)(resend_otp_controller_1.resendOtpController));
authRouter.post('/forgot-password', (0, validate_middleware_1.validateMiddleware)(toValidator(auth_1.validateForgotPassword)), (0, async_handler_1.asyncHandler)(password_controller_1.forgotPasswordController));
authRouter.get('/me', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, async_handler_1.asyncHandler)(me_controller_1.meController));
authRouter.post('/logout', (0, async_handler_1.asyncHandler)(logout_controller_1.logoutController));
authRouter.post('/change-password', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(toValidator(auth_1.validateChangePassword)), (0, async_handler_1.asyncHandler)(password_controller_1.changePasswordController));
exports.default = authRouter;
