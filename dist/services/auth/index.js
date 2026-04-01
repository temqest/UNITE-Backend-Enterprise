"use strict";
/**
 * Authentication Services Index
 * Central export for all auth-related services
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeGoogleSignup = exports.exchangeGoogleSession = exports.sendVerificationCode = exports.canResendVerificationCode = exports.verifySignupOtp = exports.clearLocalSession = exports.logoutAllDevices = exports.logout = exports.normalizePermission = exports.resolveCanonicalRole = exports.ROLE_DEFAULT_PERMISSIONS = exports.PERMISSION_CATALOG = exports.CANONICAL_ROLES = exports.getFallbackPermissions = exports.hasPermission = exports.resolveUserAuthorization = exports.getUserFromRequest = exports.hasRole = exports.hasSessionPermission = exports.getSessionTokens = exports.refreshSession = exports.validateSession = exports.getUserOrganization = exports.getCurrentUser = exports.verifyMagicLink = exports.sendMagicLink = exports.loginWithEmailPassword = void 0;
// Types
__exportStar(require("./auth.types"), exports);
// Login Services
var login_service_1 = require("./login.service");
Object.defineProperty(exports, "loginWithEmailPassword", { enumerable: true, get: function () { return login_service_1.loginWithEmailPassword; } });
Object.defineProperty(exports, "sendMagicLink", { enumerable: true, get: function () { return login_service_1.sendMagicLink; } });
Object.defineProperty(exports, "verifyMagicLink", { enumerable: true, get: function () { return login_service_1.verifyMagicLink; } });
// Session Services
var session_service_1 = require("./session.service");
Object.defineProperty(exports, "getCurrentUser", { enumerable: true, get: function () { return session_service_1.getCurrentUser; } });
Object.defineProperty(exports, "getUserOrganization", { enumerable: true, get: function () { return session_service_1.getUserOrganization; } });
Object.defineProperty(exports, "validateSession", { enumerable: true, get: function () { return session_service_1.validateSession; } });
Object.defineProperty(exports, "refreshSession", { enumerable: true, get: function () { return session_service_1.refreshSession; } });
Object.defineProperty(exports, "getSessionTokens", { enumerable: true, get: function () { return session_service_1.getSessionTokens; } });
Object.defineProperty(exports, "hasSessionPermission", { enumerable: true, get: function () { return session_service_1.hasPermission; } });
Object.defineProperty(exports, "hasRole", { enumerable: true, get: function () { return session_service_1.hasRole; } });
Object.defineProperty(exports, "getUserFromRequest", { enumerable: true, get: function () { return session_service_1.getUserFromRequest; } });
var authorization_service_1 = require("./authorization.service");
Object.defineProperty(exports, "resolveUserAuthorization", { enumerable: true, get: function () { return authorization_service_1.resolveUserAuthorization; } });
Object.defineProperty(exports, "hasPermission", { enumerable: true, get: function () { return authorization_service_1.hasPermission; } });
Object.defineProperty(exports, "getFallbackPermissions", { enumerable: true, get: function () { return authorization_service_1.getFallbackPermissions; } });
var rbac_constants_1 = require("./rbac.constants");
Object.defineProperty(exports, "CANONICAL_ROLES", { enumerable: true, get: function () { return rbac_constants_1.CANONICAL_ROLES; } });
Object.defineProperty(exports, "PERMISSION_CATALOG", { enumerable: true, get: function () { return rbac_constants_1.PERMISSION_CATALOG; } });
Object.defineProperty(exports, "ROLE_DEFAULT_PERMISSIONS", { enumerable: true, get: function () { return rbac_constants_1.ROLE_DEFAULT_PERMISSIONS; } });
Object.defineProperty(exports, "resolveCanonicalRole", { enumerable: true, get: function () { return rbac_constants_1.resolveCanonicalRole; } });
Object.defineProperty(exports, "normalizePermission", { enumerable: true, get: function () { return rbac_constants_1.normalizePermission; } });
// Logout Services
var logout_service_1 = require("./logout.service");
Object.defineProperty(exports, "logout", { enumerable: true, get: function () { return logout_service_1.logout; } });
Object.defineProperty(exports, "logoutAllDevices", { enumerable: true, get: function () { return logout_service_1.logoutAllDevices; } });
Object.defineProperty(exports, "clearLocalSession", { enumerable: true, get: function () { return logout_service_1.clearLocalSession; } });
// OTP/Email Verification Services
var verify_otp_service_1 = require("./verify-otp.service");
Object.defineProperty(exports, "verifySignupOtp", { enumerable: true, get: function () { return verify_otp_service_1.verifySignupOtp; } });
Object.defineProperty(exports, "canResendVerificationCode", { enumerable: true, get: function () { return verify_otp_service_1.canResendVerificationCode; } });
var send_verification_code_service_1 = require("./send-verification-code.service");
Object.defineProperty(exports, "sendVerificationCode", { enumerable: true, get: function () { return send_verification_code_service_1.sendVerificationCode; } });
var google_auth_service_1 = require("./google-auth.service");
Object.defineProperty(exports, "exchangeGoogleSession", { enumerable: true, get: function () { return google_auth_service_1.exchangeGoogleSession; } });
Object.defineProperty(exports, "completeGoogleSignup", { enumerable: true, get: function () { return google_auth_service_1.completeGoogleSignup; } });
