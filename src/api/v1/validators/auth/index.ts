export {
  loginSchema,
  validateLogin,
  type LoginInput,
} from './login.validator';

export {
  signupSchema,
  signupAdminSchema,
  signupStaffSchema,
  validateSignup,
  type SignupInput,
  type SignupAdminInput,
  type SignupStaffInput,
} from './signup.validator';

export {
  verifyOtpSchema,
  validateVerifyOtp,
  type VerifyOtpInput,
} from './verify-otp.validator';

export {
  resendOtpSchema,
  validateResendOtp,
  type ResendOtpInput,
} from './resend-otp.validator';

export {
  forgotPasswordSchema,
  validateForgotPassword,
  type ForgotPasswordInput,
} from './forgot-password.validator';

export {
  changePasswordSchema,
  validateChangePassword,
  type ChangePasswordInput,
} from './change-password.validator';
