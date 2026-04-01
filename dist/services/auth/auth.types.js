"use strict";
/**
 * Authentication Types
 * Shared types for auth services
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthErrorCode = void 0;
var AuthErrorCode;
(function (AuthErrorCode) {
    AuthErrorCode["INVALID_CREDENTIALS"] = "INVALID_CREDENTIALS";
    AuthErrorCode["UNVERIFIED_EMAIL"] = "UNVERIFIED_EMAIL";
    AuthErrorCode["PENDING_APPROVAL"] = "PENDING_APPROVAL";
    AuthErrorCode["INACTIVE_USER"] = "INACTIVE_USER";
    AuthErrorCode["INACTIVE_ORG"] = "INACTIVE_ORG";
    AuthErrorCode["NO_ORGANIZATION"] = "NO_ORGANIZATION";
    AuthErrorCode["SESSION_EXPIRED"] = "SESSION_EXPIRED";
    AuthErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    AuthErrorCode["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(AuthErrorCode || (exports.AuthErrorCode = AuthErrorCode = {}));
