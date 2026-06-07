"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exchangeGoogleSession = exchangeGoogleSession;
exports.completeGoogleSignup = completeGoogleSignup;
const supabase_js_1 = require("@supabase/supabase-js");
const auth_types_1 = require("./auth.types");
const rbac_constants_1 = require("./rbac.constants");
function readRequiredEnv(primaryName, ...fallbackNames) {
    const names = [primaryName, ...fallbackNames];
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) {
            return value;
        }
    }
    throw new Error(`[auth] Missing required environment variable: ${names.join(' or ')}`);
}
const supabaseUrl = readRequiredEnv('SUPABASE_URL');
const supabaseAnonKey = readRequiredEnv('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY');
const supabaseServiceRoleKey = readRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABSE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
const supabaseService = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
});
function createTokenScopedClient(accessToken) {
    return (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, {
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
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function normalizeCode(code) {
    return code.trim().toUpperCase();
}
function parseNameParts(user) {
    const metadata = user.user_metadata ?? {};
    const firstFromMeta = metadata.given_name;
    const lastFromMeta = metadata.family_name;
    const fullName = metadata.full_name ?? metadata.name;
    const firstName = typeof firstFromMeta === 'string' && firstFromMeta.trim().length > 0
        ? firstFromMeta.trim()
        : typeof fullName === 'string' && fullName.trim().length > 0
            ? fullName.trim().split(/\s+/)[0]
            : 'User';
    const lastName = typeof lastFromMeta === 'string' && lastFromMeta.trim().length > 0
        ? lastFromMeta.trim()
        : typeof fullName === 'string' && fullName.trim().length > 0
            ? fullName.trim().split(/\s+/).slice(1).join(' ') || 'User'
            : 'User';
    return { firstName, lastName };
}
async function findUniqueUserByEmail(email) {
    const normalized = normalizeEmail(email);
    const { data, error } = await supabaseService
        .from('users')
        .select('*')
        .ilike('email', normalized)
        .limit(2);
    if (error) {
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'Failed to check existing account by email.',
            details: error,
        };
    }
    const rows = (data ?? []);
    if (rows.length === 0) {
        return null;
    }
    if (rows.length > 1) {
        throw {
            code: 'ACCOUNT_LINK_CONFLICT',
            message: 'Multiple existing accounts use this email. Contact support to link your Google account.',
        };
    }
    return rows[0];
}
async function linkGoogleAuthToExistingProfile(authUser) {
    const { data: existingByAuthId, error: existingByAuthIdError } = await supabaseService
        .from('users')
        .select('*')
        .eq('auth_id', authUser.id)
        .maybeSingle();
    if (existingByAuthIdError) {
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'Failed to check existing profile state.',
            details: existingByAuthIdError,
        };
    }
    if (existingByAuthId) {
        return existingByAuthId;
    }
    // We only auto-link by email when Google already verified the email.
    if (!authUser.email_confirmed_at) {
        return null;
    }
    const existingByEmail = await findUniqueUserByEmail(authUser.email);
    if (!existingByEmail) {
        return null;
    }
    const { data: updatedProfile, error: linkError } = await supabaseService
        .from('users')
        .update({
        auth_id: authUser.id,
        email: normalizeEmail(authUser.email),
    })
        .eq('id', existingByEmail.id)
        .select('*')
        .single();
    if (linkError || !updatedProfile) {
        throw {
            code: 'ACCOUNT_LINK_FAILED',
            message: 'Failed to link Google account to existing profile.',
            details: linkError,
        };
    }
    await supabaseService.auth.admin.updateUserById(authUser.id, {
        email_confirm: true,
        user_metadata: {
            ...authUser.user_metadata,
            signup_source: 'google_oauth',
            linked_existing_account: true,
        },
    });
    return updatedProfile;
}
function toSessionUser(authUser, userData) {
    const computedFullName = [userData.first_name, userData.last_name]
        .filter((part) => typeof part === 'string' && part.trim().length > 0)
        .join(' ')
        .trim();
    return {
        id: String(userData.id),
        auth_id: String(authUser.id ?? userData.auth_id),
        email: String(userData.email),
        full_name: String(userData.full_name ?? (computedFullName || 'User')),
        phone_number: typeof userData.phone_number === 'string' ? userData.phone_number : undefined,
        org_id: typeof userData.org_id === 'string' ? userData.org_id : undefined,
        role: userData.role,
        is_active: Boolean(userData.is_active),
        force_password_change: authUser.user_metadata?.force_password_change === true,
        geographic_area: userData.geographic_area,
        email_verified: Boolean(authUser.email_confirmed_at),
        created_at: String(userData.created_at),
        updated_at: String(userData.updated_at),
    };
}
function determineRedirectPath(user, _organization) {
    if (!user.is_active) {
        return '/pending-approval';
    }
    if (String(user.role?.type ?? '').toLowerCase() === 'donor') {
        return '/donor/dashboard';
    }
    return '/dashboard';
}
async function buildSessionForAuthUser(input) {
    let userData = input.userData;
    let userError;
    if (!userData) {
        const lookup = await supabaseService
            .from('users')
            .select('*')
            .eq('auth_id', input.authUser.id)
            .maybeSingle();
        userData = lookup.data ?? undefined;
        userError = lookup.error;
    }
    if (userError || !userData) {
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: userData ? 'Failed to fetch user profile.' : 'Account setup is incomplete.',
            details: userError,
        };
    }
    if (!userData.is_active) {
        throw {
            code: auth_types_1.AuthErrorCode.PENDING_APPROVAL,
            message: 'Your account is pending approval by an administrator.',
            details: { userId: userData.id },
        };
    }
    let organization;
    if (userData.org_id) {
        const { data: orgData, error: orgError } = await supabaseService
            .from('organizations')
            .select('*')
            .eq('id', userData.org_id)
            .maybeSingle();
        if (orgError) {
            throw {
                code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
                message: 'Failed to fetch organization details.',
                details: orgError,
            };
        }
        if (orgData) {
            if (!orgData.is_active) {
                throw {
                    code: auth_types_1.AuthErrorCode.INACTIVE_ORG,
                    message: 'Your organization is currently inactive.',
                    details: { orgId: orgData.id },
                };
            }
            organization = {
                id: orgData.id,
                name: orgData.name,
                code: orgData.code,
                is_active: orgData.is_active,
                settings: orgData.settings,
            };
        }
    }
    const sessionUser = toSessionUser(input.authUser, userData);
    return {
        user: sessionUser,
        organization,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken ?? '',
        redirectTo: determineRedirectPath(sessionUser, organization),
    };
}
async function resolveGoogleAuthUser(accessToken) {
    const scopedClient = createTokenScopedClient(accessToken);
    // getUser() validates the token from the Authorization header
    // Don't pass accessToken as parameter - it's already set in the header
    const { data, error } = await scopedClient.auth.getUser();
    if (error || !data.user?.id || !data.user.email) {
        throw {
            code: auth_types_1.AuthErrorCode.INVALID_CREDENTIALS,
            message: 'Invalid Google session token. Please sign in again.',
            details: error,
        };
    }
    return {
        id: data.user.id,
        email: data.user.email,
        email_confirmed_at: data.user.email_confirmed_at,
        user_metadata: data.user.user_metadata,
    };
}
async function exchangeGoogleSession(input) {
    const authUser = await resolveGoogleAuthUser(input.accessToken);
    const existingUser = await linkGoogleAuthToExistingProfile(authUser);
    if (!existingUser) {
        const names = parseNameParts(authUser);
        return {
            status: 'requires_profile_completion',
            profile: {
                email: normalizeEmail(authUser.email),
                firstName: names.firstName,
                lastName: names.lastName,
            },
        };
    }
    return {
        status: 'complete',
        session: await buildSessionForAuthUser({
            authUser,
            accessToken: input.accessToken,
            refreshToken: input.refreshToken,
            userData: existingUser,
        }),
    };
}
async function completeGoogleSignup(input) {
    const authUser = await resolveGoogleAuthUser(input.accessToken);
    const role = input.role;
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) {
        throw {
            code: 'VALIDATION_ERROR',
            message: 'First name and last name are required.',
        };
    }
    const existingUser = await linkGoogleAuthToExistingProfile(authUser);
    if (!existingUser) {
        let orgId = '';
        let rolePayload;
        if (role === 'admin') {
            const orgName = input.organization?.name?.trim();
            const orgCode = normalizeCode(input.organization?.code ?? '');
            if (!orgName || !orgCode) {
                throw {
                    code: 'VALIDATION_ERROR',
                    message: 'organization.name and organization.code are required for admin signup.',
                };
            }
            const { data: existingOrg, error: orgLookupError } = await supabaseService
                .from('organizations')
                .select('id')
                .ilike('code', orgCode)
                .maybeSingle();
            if (orgLookupError) {
                throw {
                    code: 'ORG_LOOKUP_FAILED',
                    message: 'Failed to validate organization code.',
                    details: orgLookupError,
                };
            }
            if (existingOrg) {
                throw {
                    code: 'ORG_CODE_EXISTS',
                    message: 'Organization code is already in use.',
                };
            }
            const { data: organization, error: orgCreateError } = await supabaseService
                .from('organizations')
                .insert({
                name: orgName,
                code: orgCode,
                is_active: true,
                metadata: {},
            })
                .select('id')
                .single();
            if (orgCreateError || !organization?.id) {
                throw {
                    code: 'ORG_CREATE_FAILED',
                    message: 'Failed to create organization for Google signup.',
                    details: orgCreateError,
                };
            }
            orgId = organization.id;
            rolePayload = {
                type: 'super_admin',
                permissions: ['*'],
            };
        }
        else if (role === 'staff') {
            const orgCode = normalizeCode(input.org_code ?? '');
            if (!orgCode) {
                throw {
                    code: 'VALIDATION_ERROR',
                    message: 'org_code is required for staff signup.',
                };
            }
            const { data: organization, error: orgLookupError } = await supabaseService
                .from('organizations')
                .select('id, is_active')
                .ilike('code', orgCode)
                .maybeSingle();
            if (orgLookupError) {
                throw {
                    code: 'ORG_LOOKUP_FAILED',
                    message: 'Failed to validate organization code.',
                    details: orgLookupError,
                };
            }
            if (!organization || organization.is_active !== true) {
                throw {
                    code: 'ORG_NOT_FOUND',
                    message: 'Invalid or inactive organization code.',
                };
            }
            orgId = organization.id;
            rolePayload = {
                type: 'viewer',
                permissions: [...(rbac_constants_1.ROLE_DEFAULT_PERMISSIONS.viewer ?? [])],
            };
        }
        else {
            const explicitOrgCode = normalizeCode(input.org_code ?? '');
            const fallbackOrgCode = normalizeCode(process.env.DEFAULT_DONOR_ORG_CODE ?? '');
            const donorOrgCode = explicitOrgCode || fallbackOrgCode;
            let orgQuery = supabaseService
                .from('organizations')
                .select('id, is_active')
                .eq('is_active', true)
                .limit(1);
            if (donorOrgCode) {
                orgQuery = orgQuery.ilike('code', donorOrgCode);
            }
            const { data: organization, error: orgLookupError } = await orgQuery.maybeSingle();
            if (orgLookupError) {
                throw {
                    code: 'ORG_LOOKUP_FAILED',
                    message: 'Failed to resolve donor organization.',
                    details: orgLookupError,
                };
            }
            if (!organization || organization.is_active !== true) {
                throw {
                    code: 'ORG_NOT_FOUND',
                    message: 'No active organization is available for donor signup.',
                };
            }
            orgId = organization.id;
            rolePayload = {
                type: 'donor',
                permissions: [...(rbac_constants_1.ROLE_DEFAULT_PERMISSIONS.donor ?? [])],
            };
        }
        const isActive = role === 'admin' || role === 'donor';
        const { error: userInsertError } = await supabaseService.from('users')
            .insert({
            org_id: orgId,
            auth_id: authUser.id,
            email: normalizeEmail(authUser.email),
            first_name: firstName,
            last_name: lastName,
            role: rolePayload,
            geographic_area: null,
            is_active: isActive,
        });
        if (userInsertError) {
            throw {
                code: 'USER_CREATE_FAILED',
                message: 'Failed to create user profile.',
                details: userInsertError,
            };
        }
        if (role === 'donor') {
            const { data: donorUser, error: donorUserError } = await supabaseService
                .from('users')
                .select('id')
                .eq('auth_id', authUser.id)
                .single();
            if (donorUserError || !donorUser?.id) {
                throw {
                    code: 'DONOR_PROFILE_CREATE_FAILED',
                    message: 'Failed to resolve donor account for profile setup.',
                    details: donorUserError,
                };
            }
            const donorProfilePayload = {
                user_id: donorUser.id,
                blood_type: input.blood_type ?? null,
                phone_number: input.phone_number ?? null,
                province: input.province ?? null,
                city: input.city ?? null,
                health_info: {},
            };
            const { error: donorProfileError } = await supabaseService.from('donor_profiles')
                .upsert(donorProfilePayload, { onConflict: 'user_id' });
            if (donorProfileError) {
                throw {
                    code: 'DONOR_PROFILE_CREATE_FAILED',
                    message: 'Failed to create donor profile.',
                    details: donorProfileError,
                };
            }
        }
        await supabaseService.auth.admin.updateUserById(authUser.id, {
            email_confirm: true,
            user_metadata: {
                ...authUser.user_metadata,
                first_name: firstName,
                last_name: lastName,
                signup_source: 'google_oauth',
            },
        });
    }
    return buildSessionForAuthUser({
        authUser,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
    });
}
