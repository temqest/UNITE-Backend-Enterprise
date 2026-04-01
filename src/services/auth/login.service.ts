/**
 * Login Service
 * Handles email/password and magic link authentication
 */

import { createClient } from '@supabase/supabase-js';
import {
  LoginInput,
  MagicLinkInput,
  LoginResponse,
  SessionUser,
  OrganizationInfo,
  AuthError,
  AuthErrorCode,
  UserRole,
  GeographicArea,
} from './auth.types';
import { resolveCanonicalRole } from './rbac.constants';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function resolveOrLinkUserProfile(authUserId: string, email?: string | null): Promise<any> {
  const { data: byAuthId, error: byAuthIdError } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', authUserId)
    .maybeSingle();

  if (byAuthIdError) {
    throw {
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: 'Failed to fetch user profile',
      details: byAuthIdError,
    } as AuthError;
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
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: 'Failed to fetch user profile',
      details: byEmailError,
    } as AuthError;
  }

  const rows = byEmail ?? [];
  if (rows.length === 0) {
    return null;
  }

  if (rows.length > 1) {
    throw {
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: 'Multiple accounts found for this email. Contact support.',
    } as AuthError;
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
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: 'Failed to link account profile.',
      details: updateError,
    } as AuthError;
  }

  return updatedProfile;
}

/**
 * Login with email and password
 */
export async function loginWithEmailPassword(
  input: LoginInput
): Promise<LoginResponse> {
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
        code: AuthErrorCode.INVALID_CREDENTIALS,
        message: 'Authentication failed',
      } as AuthError;
    }

    // Check if email is verified
    if (!authData.user.email_confirmed_at) {
      throw {
        code: AuthErrorCode.UNVERIFIED_EMAIL,
        message: 'Please verify your email before logging in',
        details: { email: authData.user.email },
      } as AuthError;
    }

    // Step 2: Fetch user profile from users table
    const userData = await resolveOrLinkUserProfile(authData.user.id, authData.user.email);

    if (!userData) {
      throw {
        code: AuthErrorCode.UNKNOWN_ERROR,
        message: 'Failed to fetch user profile',
      } as AuthError;
    }

    // Step 3: Check if user is active
    if (!userData.is_active) {
      throw {
        code: AuthErrorCode.PENDING_APPROVAL,
        message: 'Your account is pending approval by an administrator',
        details: { userId: userData.id },
      } as AuthError;
    }

    const sessionUser: SessionUser = {
      id: userData.id,
      email: userData.email,
      full_name: userData.full_name,
      phone_number: userData.phone_number,
      org_id: userData.org_id,
      role: userData.role as UserRole,
      is_active: userData.is_active,
      force_password_change: authData.user.user_metadata?.force_password_change === true,
      geographic_area: userData.geographic_area as GeographicArea,
      email_verified: true,
      created_at: userData.created_at,
      updated_at: userData.updated_at,
    };

    // Step 4: Fetch organization info if user belongs to an org
    let organization: OrganizationInfo | undefined;
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
            code: AuthErrorCode.INACTIVE_ORG,
            message: 'Your organization is currently inactive',
            details: { orgId: orgData.id },
          } as AuthError;
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
  } catch (error) {
    if ((error as AuthError).code) {
      throw error;
    }
    throw {
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: 'An unexpected error occurred during login',
      details: error,
    } as AuthError;
  }
}

/**
 * Send magic link for passwordless authentication
 */
export async function sendMagicLink(input: MagicLinkInput): Promise<{ success: boolean; message: string }> {
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
  } catch (error) {
    if ((error as AuthError).code) {
      throw error;
    }
    throw {
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: 'Failed to send magic link',
      details: error,
    } as AuthError;
  }
}

/**
 * Verify magic link OTP and complete login
 */
export async function verifyMagicLink(
  email: string,
  token: string
): Promise<LoginResponse> {
  try {
    // Step 1: Verify the OTP token
    const { data: authData, error: authError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (authError || !authData.user || !authData.session) {
      throw {
        code: AuthErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid or expired magic link',
        details: authError,
      } as AuthError;
    }

    // Step 2: Fetch user profile
    const userData = await resolveOrLinkUserProfile(authData.user.id, authData.user.email);

    if (!userData) {
      throw {
        code: AuthErrorCode.UNKNOWN_ERROR,
        message: 'Failed to fetch user profile',
      } as AuthError;
    }

    // Step 3: Check if user is active
    if (!userData.is_active) {
      throw {
        code: AuthErrorCode.PENDING_APPROVAL,
        message: 'Your account is pending approval by an administrator',
        details: { userId: userData.id },
      } as AuthError;
    }

    const sessionUser: SessionUser = {
      id: userData.id,
      email: userData.email,
      full_name: userData.full_name,
      phone_number: userData.phone_number,
      org_id: userData.org_id,
      role: userData.role as UserRole,
      is_active: userData.is_active,
      force_password_change: authData.user.user_metadata?.force_password_change === true,
      geographic_area: userData.geographic_area as GeographicArea,
      email_verified: true,
      created_at: userData.created_at,
      updated_at: userData.updated_at,
    };

    // Step 4: Fetch organization info
    let organization: OrganizationInfo | undefined;
    if (userData.org_id) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', userData.org_id)
        .single();

      if (orgData) {
        if (!orgData.is_active) {
          throw {
            code: AuthErrorCode.INACTIVE_ORG,
            message: 'Your organization is currently inactive',
            details: { orgId: orgData.id },
          } as AuthError;
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
  } catch (error) {
    if ((error as AuthError).code) {
      throw error;
    }
    throw {
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: 'Failed to verify magic link',
      details: error,
    } as AuthError;
  }
}

/**
 * Determine redirect path based on user role and organization
 */
function determineRedirectPath(
  user: SessionUser,
  _organization?: OrganizationInfo
): string {
  // If user is inactive (should not reach here, but safety check)
  if (!user.is_active) {
    return '/pending-approval';
  }

  // Frontend prototype currently exposes a single dashboard route.
  return '/dashboard';
}

/**
 * Convert Supabase auth error to AuthError
 */
function createAuthError(error: any): AuthError {
  if (error.message?.includes('Invalid login credentials')) {
    return {
      code: AuthErrorCode.INVALID_CREDENTIALS,
      message: 'Invalid email or password',
      details: error,
    };
  }

  if (error.message?.includes('Email not confirmed')) {
    return {
      code: AuthErrorCode.UNVERIFIED_EMAIL,
      message: 'Please verify your email before logging in',
      details: error,
    };
  }

  return {
    code: AuthErrorCode.UNKNOWN_ERROR,
    message: error.message || 'Authentication failed',
    details: error,
  };
}
