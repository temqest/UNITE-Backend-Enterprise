/**
 * Session Service
 * Handles session validation, refresh, and user context retrieval
 */

import { createClient } from '@supabase/supabase-js';
import {
  SessionUser,
  OrganizationInfo,
  SessionValidationResult,
  AuthError,
  AuthErrorCode,
  UserRole,
  GeographicArea,
} from './auth.types';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function createTokenScopedClient(accessToken?: string) {
  if (!accessToken) {
    return supabase;
  }

  return createClient(supabaseUrl, supabaseKey, {
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
export async function getCurrentUser(accessToken?: string): Promise<SessionUser | null> {
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
        code: AuthErrorCode.UNKNOWN_ERROR,
        message: 'Failed to fetch user profile',
        details: userError,
      } as AuthError;
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
      role: userData.role as UserRole,
      is_active: userData.is_active,
      geographic_area: userData.geographic_area as GeographicArea,
      email_verified: !!user.email_confirmed_at,
      created_at: userData.created_at,
      updated_at: userData.updated_at,
    };
  } catch (error) {
    if ((error as AuthError).code) {
      throw error;
    }
    return null;
  }
}

/**
 * Get organization info for a user
 */
export async function getUserOrganization(orgId: string): Promise<OrganizationInfo | null> {
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
  } catch (error) {
    return null;
  }
}

/**
 * Validate current session and return user + org info
 */
export async function validateSession(accessToken?: string): Promise<SessionValidationResult> {
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
    let organization: OrganizationInfo | undefined;
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
  } catch (error) {
    return {
      isValid: false,
      reason: 'invalid_token',
    };
  }
}

/**
 * Refresh the current session
 */
export async function refreshSession(): Promise<{
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
} | null> {
  try {
    const { data, error } = await supabase.auth.refreshSession();

    if (error || !data.session || !data.user) {
      throw {
        code: AuthErrorCode.SESSION_EXPIRED,
        message: 'Session expired. Please login again.',
        details: error,
      } as AuthError;
    }

    // Fetch updated user profile
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', data.user.id)
      .maybeSingle();

    if (userError || !userData) {
      throw {
        code: AuthErrorCode.UNKNOWN_ERROR,
        message: userData ? 'Failed to fetch user profile' : 'User profile does not exist for this account',
        details: userError,
      } as AuthError;
    }

    const sessionUser: SessionUser = {
      id: userData.id,
      auth_id: data.user.id,
      email: userData.email,
      full_name: userData.full_name,
      phone_number: userData.phone_number,
      org_id: userData.org_id,
      role: userData.role as UserRole,
      is_active: userData.is_active,
      geographic_area: userData.geographic_area as GeographicArea,
      email_verified: !!data.user.email_confirmed_at,
      created_at: userData.created_at,
      updated_at: userData.updated_at,
    };

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: sessionUser,
    };
  } catch (error) {
    if ((error as AuthError).code) {
      throw error;
    }
    throw {
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: 'Failed to refresh session',
      details: error,
    } as AuthError;
  }
}

/**
 * Get session tokens from current session
 */
export async function getSessionTokens(): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return null;
    }

    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Check if user has specific permission
 */
export function hasPermission(user: SessionUser, permission: string): boolean {
  return user.role.permissions.includes(permission);
}

/**
 * Check if user has any of the specified roles
 */
export function hasRole(user: SessionUser, ...roles: string[]): boolean {
  return roles.includes(user.role.type);
}

/**
 * Middleware helper: Extract user from request
 * Useful for Express/Fastify middleware
 */
export async function getUserFromRequest(authHeader?: string): Promise<SessionUser | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  return getCurrentUser(token);
}
