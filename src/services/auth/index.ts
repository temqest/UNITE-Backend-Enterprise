/**
 * Authentication Services Index
 * Central export for all auth-related services
 */

// Types
export * from './auth.types';

// Login Services
export {
  loginWithEmailPassword,
  sendMagicLink,
  verifyMagicLink,
} from './login.service';

// Session Services
export {
  getCurrentUser,
  getUserOrganization,
  validateSession,
  refreshSession,
  getSessionTokens,
  hasPermission as hasSessionPermission,
  hasRole,
  getUserFromRequest,
} from './session.service';

export {
  resolveUserAuthorization,
  hasPermission,
  getFallbackPermissions,
} from './authorization.service';

export {
  CANONICAL_ROLES,
  PERMISSION_CATALOG,
  ROLE_DEFAULT_PERMISSIONS,
  resolveCanonicalRole,
  normalizePermission,
} from './rbac.constants';

// Logout Services
export {
  logout,
  logoutAllDevices,
  clearLocalSession,
} from './logout.service';

// OTP/Email Verification Services
export {
  verifySignupOtp,
  canResendVerificationCode,
} from './verify-otp.service';

export {
  sendVerificationCode,
} from './send-verification-code.service';

export {
  exchangeGoogleSession,
  completeGoogleSignup,
} from './google-auth.service';

export type {
  GoogleExchangeInput,
  GoogleCompletionInput,
  GoogleExchangeResult,
} from './google-auth.service';

export type {
  SendVerificationCodeInput,
  SendVerificationCodeResult,
} from './send-verification-code.service';

export type {
  VerifyOtpInput,
  VerifyOtpResult,
} from './verify-otp.service';
