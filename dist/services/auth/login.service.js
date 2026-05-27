"use strict";
/**
 * Login Service
 * Handles email/password and magic link authentication
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginWithEmailPassword = loginWithEmailPassword;
exports.sendMagicLink = sendMagicLink;
exports.verifyMagicLink = verifyMagicLink;
const supabase_js_1 = require("@supabase/supabase-js");
const auth_types_1 = require("./auth.types");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function buildDisplayName(userData) {
    const explicitName = String(userData?.full_name ?? '').trim();
    if (explicitName.length > 0) {
        return explicitName;
    }
    const derivedName = [userData?.first_name, userData?.last_name]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
    return derivedName || 'User';
}
async function resolveOrLinkUserProfile(authUserId, email) {
    const { data: byAuthId, error: byAuthIdError } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', authUserId)
        .maybeSingle();
    if (byAuthIdError) {
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'Failed to fetch user profile',
            details: byAuthIdError,
        };
    }
    if (byAuthId) {
        return byAuthId;
    }
    if (!email) {
        return null;
    }
    const normalizedEmail = normalizeEmail(email);
    const { data: byEmail, error: byEmailError } = await supabase
        .from('users')
        .select('*')
        .ilike('email', normalizedEmail)
        .limit(2);
    if (byEmailError) {
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'Failed to fetch user profile',
            details: byEmailError,
        };
    }
    const rows = byEmail ?? [];
    if (rows.length === 0) {
        return null;
    }
    if (rows.length > 1) {
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'Multiple accounts found for this email. Contact support.',
        };
    }
    const linked = rows[0];
    const { data: updatedProfile, error: updateError } = await supabase
        .from('users')
        .update({
        auth_id: authUserId,
        email: normalizedEmail,
    })
        .eq('id', linked.id)
        .select('*')
        .single();
    if (updateError || !updatedProfile) {
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'Failed to link account profile.',
            details: updateError,
        };
    }
    return updatedProfile;
}
/**
 * Login with email and password
 */
async function loginWithEmailPassword(input) {
    try {
        // Step 1: Authenticate with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: input.email,
            password: input.password,
        });
        if (authError) {
            throw createAuthError(authError);
        }
        if (!authData.user || !authData.session) {
            throw {
                code: auth_types_1.AuthErrorCode.INVALID_CREDENTIALS,
                message: 'Authentication failed',
            };
        }
        // Check if email is verified
        if (!authData.user.email_confirmed_at) {
            throw {
                code: auth_types_1.AuthErrorCode.UNVERIFIED_EMAIL,
                message: 'Please verify your email before logging in',
                details: { email: authData.user.email },
            };
        }
        // Step 2: Fetch user profile from users table
        const userData = await resolveOrLinkUserProfile(authData.user.id, authData.user.email);
        if (!userData) {
            throw {
                code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
                message: 'Failed to fetch user profile',
            };
        }
        // Step 3: Check if user is active
        if (!userData.is_active) {
            throw {
                code: auth_types_1.AuthErrorCode.PENDING_APPROVAL,
                message: 'Your account is pending approval by an administrator',
                details: { userId: userData.id },
            };
        }
        const sessionUser = {
            id: userData.id,
            auth_id: authData.user.id,
            email: userData.email,
            full_name: buildDisplayName(userData),
            phone_number: typeof userData.phone_number === 'string' ? userData.phone_number : undefined,
            org_id: userData.org_id,
            role: userData.role,
            is_active: userData.is_active,
            force_password_change: authData.user.user_metadata?.force_password_change === true,
            geographic_area: userData.geographic_area,
            email_verified: true,
            created_at: userData.created_at,
            updated_at: userData.updated_at,
        };
        // Step 4: Fetch organization info if user belongs to an org
        let organization;
        if (userData.org_id) {
            const { data: orgData, error: orgError } = await supabase
                .from('organizations')
                .select('*')
                .eq('id', userData.org_id)
                .single();
            if (orgData) {
                // Check if organization is active
                if (!orgData.is_active) {
                    throw {
                        code: auth_types_1.AuthErrorCode.INACTIVE_ORG,
                        message: 'Your organization is currently inactive',
                        details: { orgId: orgData.id },
                    };
                }
                organization = {
                    id: orgData.id,
                    name: orgData.name,
                    is_active: orgData.is_active,
                    settings: orgData.settings,
                };
            }
        }
        // Step 5: Determine redirect path based on role and status
        const redirectTo = determineRedirectPath(sessionUser, organization);
        return {
            user: sessionUser,
            organization,
            accessToken: authData.session.access_token,
            refreshToken: authData.session.refresh_token,
            redirectTo,
        };
    }
    catch (error) {
        if (error.code) {
            throw error;
        }
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'An unexpected error occurred during login',
            details: error,
        };
    }
}
/**
 * Send magic link for passwordless authentication
 */
async function sendMagicLink(input) {
    try {
        const { error } = await supabase.auth.signInWithOtp({
            email: input.email,
            options: {
                emailRedirectTo: input.redirectTo || `${process.env.APP_URL}/auth/callback`,
            },
        });
        if (error) {
            throw createAuthError(error);
        }
        return {
            success: true,
            message: 'Magic link sent successfully. Please check your email.',
        };
    }
    catch (error) {
        if (error.code) {
            throw error;
        }
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'Failed to send magic link',
            details: error,
        };
    }
}
/**
 * Verify magic link OTP and complete login
 */
async function verifyMagicLink(email, token) {
    try {
        // Step 1: Verify the OTP token
        const { data: authData, error: authError } = await supabase.auth.verifyOtp({
            email,
            token,
            type: 'email',
        });
        if (authError || !authData.user || !authData.session) {
            throw {
                code: auth_types_1.AuthErrorCode.INVALID_CREDENTIALS,
                message: 'Invalid or expired magic link',
                details: authError,
            };
        }
        // Step 2: Fetch user profile
        const userData = await resolveOrLinkUserProfile(authData.user.id, authData.user.email);
        if (!userData) {
            throw {
                code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
                message: 'Failed to fetch user profile',
            };
        }
        // Step 3: Check if user is active
        if (!userData.is_active) {
            throw {
                code: auth_types_1.AuthErrorCode.PENDING_APPROVAL,
                message: 'Your account is pending approval by an administrator',
                details: { userId: userData.id },
            };
        }
        const sessionUser = {
            id: userData.id,
            auth_id: authData.user.id,
            email: userData.email,
            full_name: buildDisplayName(userData),
            phone_number: typeof userData.phone_number === 'string' ? userData.phone_number : undefined,
            org_id: userData.org_id,
            role: userData.role,
            is_active: userData.is_active,
            force_password_change: authData.user.user_metadata?.force_password_change === true,
            geographic_area: userData.geographic_area,
            email_verified: true,
            created_at: userData.created_at,
            updated_at: userData.updated_at,
        };
        // Step 4: Fetch organization info
        let organization;
        if (userData.org_id) {
            const { data: orgData } = await supabase
                .from('organizations')
                .select('*')
                .eq('id', userData.org_id)
                .single();
            if (orgData) {
                if (!orgData.is_active) {
                    throw {
                        code: auth_types_1.AuthErrorCode.INACTIVE_ORG,
                        message: 'Your organization is currently inactive',
                        details: { orgId: orgData.id },
                    };
                }
                organization = {
                    id: orgData.id,
                    name: orgData.name,
                    is_active: orgData.is_active,
                    settings: orgData.settings,
                };
            }
        }
        const redirectTo = determineRedirectPath(sessionUser, organization);
        return {
            user: sessionUser,
            organization,
            accessToken: authData.session.access_token,
            refreshToken: authData.session.refresh_token,
            redirectTo,
        };
    }
    catch (error) {
        if (error.code) {
            throw error;
        }
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'Failed to verify magic link',
            details: error,
        };
    }
}
/**
 * Determine redirect path based on user role and organization
 */
function determineRedirectPath(user, _organization) {
    // If user is inactive (should not reach here, but safety check)
    if (!user.is_active) {
        return '/pending-approval';
    }
    if (String(user.role?.type ?? '').toLowerCase() === 'donor') {
        return '/donor/dashboard';
    }
    return '/dashboard';
}
/**
 * Convert Supabase auth error to AuthError
 */
function createAuthError(error) {
    if (error.message?.includes('Invalid login credentials')) {
        return {
            code: auth_types_1.AuthErrorCode.INVALID_CREDENTIALS,
            message: 'Invalid email or password',
            details: error,
        };
    }
    if (error.message?.includes('Email not confirmed')) {
        return {
            code: auth_types_1.AuthErrorCode.UNVERIFIED_EMAIL,
            message: 'Please verify your email before logging in',
            details: error,
        };
    }
    return {
        code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
        message: error.message || 'Authentication failed',
        details: error,
    };
}
