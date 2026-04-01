"use strict";
/**
 * Logout Service
 * Handles session cleanup and user logout
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = logout;
exports.logoutAllDevices = logoutAllDevices;
exports.clearLocalSession = clearLocalSession;
const supabase_js_1 = require("@supabase/supabase-js");
const auth_types_1 = require("./auth.types");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
/**
 * Logout the current user
 */
async function logout() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) {
            throw {
                code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
                message: 'Failed to logout',
                details: error,
            };
        }
        return {
            success: true,
            message: 'Logged out successfully',
        };
    }
    catch (error) {
        if (error.code) {
            throw error;
        }
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'An unexpected error occurred during logout',
            details: error,
        };
    }
}
/**
 * Logout from all devices (revoke all sessions)
 */
async function logoutAllDevices() {
    try {
        // Sign out with global scope to revoke all sessions
        const { error } = await supabase.auth.signOut({
            scope: 'global'
        });
        if (error) {
            throw {
                code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
                message: 'Failed to logout from all devices',
                details: error,
            };
        }
        return {
            success: true,
            message: 'Logged out from all devices successfully',
        };
    }
    catch (error) {
        if (error.code) {
            throw error;
        }
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'An unexpected error occurred during logout',
            details: error,
        };
    }
}
/**
 * Clear local session data (client-side helper)
 * This is useful for cleanup in case of errors
 */
async function clearLocalSession() {
    try {
        await supabase.auth.signOut({ scope: 'local' });
    }
    catch (error) {
        // Silently fail - this is just cleanup
        console.error('Failed to clear local session:', error);
    }
}
