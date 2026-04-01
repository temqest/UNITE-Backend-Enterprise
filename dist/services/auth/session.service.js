"use strict";
/**
 * Session Service
 * Handles session validation, refresh, and user context retrieval
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentUser = getCurrentUser;
exports.getUserOrganization = getUserOrganization;
exports.validateSession = validateSession;
exports.refreshSession = refreshSession;
exports.getSessionTokens = getSessionTokens;
exports.hasPermission = hasPermission;
exports.hasRole = hasRole;
exports.getUserFromRequest = getUserFromRequest;
const supabase_js_1 = require("@supabase/supabase-js");
const auth_types_1 = require("./auth.types");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
function createTokenScopedClient(accessToken) {
    if (!accessToken) {
        return supabase;
    }
    return (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
        global: {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });
}
/**
 * Get current authenticated user with full profile and organization
 */
async function getCurrentUser(accessToken) {
    try {
        const scopedClient = createTokenScopedClient(accessToken);
        const { data: { user }, error: sessionError } = accessToken
            ? await scopedClient.auth.getUser(accessToken)
            : await scopedClient.auth.getUser();
        if (sessionError || !user) {
            return null;
        }
        // Fetch user profile from database
        const { data: userData, error: userError } = await scopedClient
            .from('users')
            .select('*')
            .eq('auth_id', user.id)
            .maybeSingle();
        if (userError) {
            throw {
                code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
                message: 'Failed to fetch user profile',
                details: userError,
            };
        }
        // Missing profile should be treated as unauthenticated/incomplete setup, not a server error.
        if (!userData) {
            return null;
        }
        return {
            id: userData.id,
            auth_id: user.id,
            email: userData.email,
            full_name: userData.full_name,
            phone_number: userData.phone_number,
            org_id: userData.org_id,
            role: userData.role,
            is_active: userData.is_active,
            geographic_area: userData.geographic_area,
            email_verified: !!user.email_confirmed_at,
            created_at: userData.created_at,
            updated_at: userData.updated_at,
        };
    }
    catch (error) {
        if (error.code) {
            throw error;
        }
        return null;
    }
}
/**
 * Get organization info for a user
 */
async function getUserOrganization(orgId) {
    try {
        const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', orgId)
            .maybeSingle();
        if (orgError || !orgData) {
            return null;
        }
        return {
            id: orgData.id,
            name: orgData.name,
            is_active: orgData.is_active,
            settings: orgData.settings,
        };
    }
    catch (error) {
        return null;
    }
}
/**
 * Validate current session and return user + org info
 */
async function validateSession(accessToken) {
    try {
        const user = await getCurrentUser(accessToken);
        if (!user) {
            return {
                isValid: false,
                reason: 'no_session',
            };
        }
        // Check email verification
        if (!user.email_verified) {
            return {
                isValid: false,
                user,
                reason: 'unverified_email',
            };
        }
        // Check if user is active
        if (!user.is_active) {
            return {
                isValid: false,
                user,
                reason: 'inactive_user',
            };
        }
        // Fetch organization if user has one
        let organization;
        if (user.org_id) {
            const org = await getUserOrganization(user.org_id);
            if (org) {
                // Check if organization is active
                if (!org.is_active) {
                    return {
                        isValid: false,
                        user,
                        organization: org,
                        reason: 'inactive_org',
                    };
                }
                organization = org;
            }
        }
        return {
            isValid: true,
            user,
            organization,
        };
    }
    catch (error) {
        return {
            isValid: false,
            reason: 'invalid_token',
        };
    }
}
/**
 * Refresh the current session
 */
async function refreshSession() {
    try {
        const { data, error } = await supabase.auth.refreshSession();
        if (error || !data.session || !data.user) {
            throw {
                code: auth_types_1.AuthErrorCode.SESSION_EXPIRED,
                message: 'Session expired. Please login again.',
                details: error,
            };
        }
        // Fetch updated user profile
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('auth_id', data.user.id)
            .maybeSingle();
        if (userError || !userData) {
            throw {
                code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
                message: userData ? 'Failed to fetch user profile' : 'User profile does not exist for this account',
                details: userError,
            };
        }
        const sessionUser = {
            id: userData.id,
            auth_id: data.user.id,
            email: userData.email,
            full_name: userData.full_name,
            phone_number: userData.phone_number,
            org_id: userData.org_id,
            role: userData.role,
            is_active: userData.is_active,
            geographic_area: userData.geographic_area,
            email_verified: !!data.user.email_confirmed_at,
            created_at: userData.created_at,
            updated_at: userData.updated_at,
        };
        return {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
            user: sessionUser,
        };
    }
    catch (error) {
        if (error.code) {
            throw error;
        }
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'Failed to refresh session',
            details: error,
        };
    }
}
/**
 * Get session tokens from current session
 */
async function getSessionTokens() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
            return null;
        }
        return {
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
        };
    }
    catch (error) {
        return null;
    }
}
/**
 * Check if user has specific permission
 */
function hasPermission(user, permission) {
    return user.role.permissions.includes(permission);
}
/**
 * Check if user has any of the specified roles
 */
function hasRole(user, ...roles) {
    return roles.includes(user.role.type);
}
/**
 * Middleware helper: Extract user from request
 * Useful for Express/Fastify middleware
 */
async function getUserFromRequest(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.substring(7);
    return getCurrentUser(token);
}
