import { createClient } from '@supabase/supabase-js';
import { AuthError, AuthErrorCode, LoginResponse, SessionUser, UserRole, GeographicArea } from './auth.types';
import type { OrganizationInfo } from './auth.types';
import { ROLE_DEFAULT_PERMISSIONS } from './rbac.constants';

export interface GoogleExchangeInput {
  accessToken: string;
  refreshToken?: string;
}

export interface GoogleCompletionInput extends GoogleExchangeInput {
  role: 'admin' | 'staff' | 'donor';
  firstName: string;
  lastName: string;
  blood_type?: 'O+' | 'O-' | 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-';
  phone_number?: string;
  province?: string;
  city?: string;
  organization?: {
    name: string;
    code: string;
  };
  org_code?: string;
}

export type GoogleExchangeResult =
  | {
      status: 'complete';
      session: LoginResponse;
    }
  | {
      status: 'requires_profile_completion';
      profile: {
        email: string;
        firstName: string;
        lastName: string;
      };
    };

interface ResolvedGoogleAuthUser {
  id: string;
  email: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
}

interface UserProfileRow {
  id: string;
  auth_id: string;
  org_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  geographic_area: GeographicArea | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  full_name?: string | null;
  phone_number?: string | null;
}

function readRequiredEnv(primaryName: string, ...fallbackNames: string[]): string {
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
const supabaseServiceRoleKey = readRequiredEnv(
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABSE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY'
);

const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

function createTokenScopedClient(accessToken: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function parseNameParts(user: {
  user_metadata?: Record<string, unknown>;
  email?: string;
}): { firstName: string; lastName: string } {
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

async function findUniqueUserByEmail(email: string): Promise<UserProfileRow | null> {
  const normalized = normalizeEmail(email);
  const { data, error } = await supabaseService
    .from('users')
    .select('*')
    .ilike('email', normalized)
    .limit(2);

  if (error) {
    throw {
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: 'Failed to check existing account by email.',
      details: error,
    } as AuthError;
  }

  const rows = (data ?? []) as UserProfileRow[];
  if (rows.length === 0) {
    return null;
  }

  if (rows.length > 1) {
    throw {
      code: 'ACCOUNT_LINK_CONFLICT',
      message: 'Multiple existing accounts use this email. Contact support to link your Google account.',
    } as AuthError;
  }

  return rows[0];
}

async function linkGoogleAuthToExistingProfile(authUser: ResolvedGoogleAuthUser): Promise<UserProfileRow | null> {
  const { data: existingByAuthId, error: existingByAuthIdError } = await supabaseService
    .from('users')
    .select('*')
    .eq('auth_id', authUser.id)
    .maybeSingle();

  if (existingByAuthIdError) {
    throw {
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: 'Failed to check existing profile state.',
      details: existingByAuthIdError,
    } as AuthError;
  }

  if (existingByAuthId) {
    return existingByAuthId as UserProfileRow;
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
    } as AuthError;
  }

  await supabaseService.auth.admin.updateUserById(authUser.id, {
    email_confirm: true,
    user_metadata: {
      ...authUser.user_metadata,
      signup_source: 'google_oauth',
      linked_existing_account: true,
    },
  });

  return updatedProfile as UserProfileRow;
}

function toSessionUser(authUser: { email_confirmed_at?: string | null; user_metadata?: Record<string, unknown> }, userData: UserProfileRow): SessionUser {
  const computedFullName = [userData.first_name, userData.last_name]
    .filter((part: unknown) => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .trim();

  return {
    id: String(userData.id),
    email: String(userData.email),
    full_name: String(userData.full_name ?? (computedFullName || 'User')),
    phone_number: typeof userData.phone_number === 'string' ? userData.phone_number : undefined,
    org_id: typeof userData.org_id === 'string' ? userData.org_id : undefined,
    role: userData.role as UserRole,
    is_active: Boolean(userData.is_active),
    force_password_change: authUser.user_metadata?.force_password_change === true,
    geographic_area: userData.geographic_area as GeographicArea,
    email_verified: Boolean(authUser.email_confirmed_at),
    created_at: String(userData.created_at),
    updated_at: String(userData.updated_at),
  };
}

function determineRedirectPath(user: SessionUser, _organization?: OrganizationInfo): string {
  if (!user.is_active) {
    return '/pending-approval';
  }

  if (String(user.role?.type ?? '').toLowerCase() === 'donor') {
    return '/donor/dashboard';
  }

  return '/dashboard';
}

async function buildSessionForAuthUser(input: {
  authUser: ResolvedGoogleAuthUser;
  accessToken: string;
  refreshToken?: string;
  userData?: UserProfileRow;
}): Promise<LoginResponse> {
  let userData = input.userData;
  let userError: unknown;

  if (!userData) {
    const lookup = await supabaseService
      .from('users')
      .select('*')
      .eq('auth_id', input.authUser.id)
      .maybeSingle();

    userData = (lookup.data as UserProfileRow | null) ?? undefined;
    userError = lookup.error;
  }

  if (userError || !userData) {
    throw {
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: userData ? 'Failed to fetch user profile.' : 'Account setup is incomplete.',
      details: userError,
    } as AuthError;
  }

  if (!userData.is_active) {
    throw {
      code: AuthErrorCode.PENDING_APPROVAL,
      message: 'Your account is pending approval by an administrator.',
      details: { userId: userData.id },
    } as AuthError;
  }

  let organization: OrganizationInfo | undefined;
  if (userData.org_id) {
    const { data: orgData, error: orgError } = await supabaseService
      .from('organizations')
      .select('*')
      .eq('id', userData.org_id)
      .maybeSingle();

    if (orgError) {
      throw {
        code: AuthErrorCode.UNKNOWN_ERROR,
        message: 'Failed to fetch organization details.',
        details: orgError,
      } as AuthError;
    }

    if (orgData) {
      if (!orgData.is_active) {
        throw {
          code: AuthErrorCode.INACTIVE_ORG,
          message: 'Your organization is currently inactive.',
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

  const sessionUser = toSessionUser(input.authUser, userData);

  return {
    user: sessionUser,
    organization,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken ?? '',
    redirectTo: determineRedirectPath(sessionUser, organization),
  };
}

async function resolveGoogleAuthUser(accessToken: string): Promise<ResolvedGoogleAuthUser> {
  const scopedClient = createTokenScopedClient(accessToken);
  const { data, error } = await scopedClient.auth.getUser(accessToken);

  if (error || !data.user?.id || !data.user.email) {
    throw {
      code: AuthErrorCode.INVALID_CREDENTIALS,
      message: 'Invalid Google session token. Please sign in again.',
      details: error,
    } as AuthError;
  }

  return {
    id: data.user.id,
    email: data.user.email,
    email_confirmed_at: data.user.email_confirmed_at,
    user_metadata: data.user.user_metadata as Record<string, unknown> | undefined,
  };
}

export async function exchangeGoogleSession(input: GoogleExchangeInput): Promise<GoogleExchangeResult> {
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

export async function completeGoogleSignup(input: GoogleCompletionInput): Promise<LoginResponse> {
  const authUser = await resolveGoogleAuthUser(input.accessToken);
  const role = input.role;
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();

  if (!firstName || !lastName) {
    throw {
      code: 'VALIDATION_ERROR',
      message: 'First name and last name are required.',
    } as AuthError;
  }

  const existingUser = await linkGoogleAuthToExistingProfile(authUser);

  if (!existingUser) {
    let orgId = '';
    let rolePayload: UserRole;

    if (role === 'admin') {
      const orgName = input.organization?.name?.trim();
      const orgCode = normalizeCode(input.organization?.code ?? '');

      if (!orgName || !orgCode) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'organization.name and organization.code are required for admin signup.',
        } as AuthError;
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
        } as AuthError;
      }

      if (existingOrg) {
        throw {
          code: 'ORG_CODE_EXISTS',
          message: 'Organization code is already in use.',
        } as AuthError;
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
        } as AuthError;
      }

      orgId = organization.id;
      rolePayload = {
        type: 'super_admin',
        permissions: ['*'],
      };
    } else if (role === 'staff') {
      const orgCode = normalizeCode(input.org_code ?? '');
      if (!orgCode) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'org_code is required for staff signup.',
        } as AuthError;
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
        } as AuthError;
      }

      if (!organization || organization.is_active !== true) {
        throw {
          code: 'ORG_NOT_FOUND',
          message: 'Invalid or inactive organization code.',
        } as AuthError;
      }

      orgId = organization.id;
      rolePayload = {
        type: 'viewer',
        permissions: [...(ROLE_DEFAULT_PERMISSIONS.viewer ?? [])],
      };
    } else {
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
        } as AuthError;
      }

      if (!organization || organization.is_active !== true) {
        throw {
          code: 'ORG_NOT_FOUND',
          message: 'No active organization is available for donor signup.',
        } as AuthError;
      }

      orgId = organization.id;
      rolePayload = {
        type: 'donor',
        permissions: [...(ROLE_DEFAULT_PERMISSIONS.donor ?? [])],
      };
    }

    const isActive = role === 'admin' || role === 'donor';

    const { error: userInsertError } = await (supabaseService.from('users') as any)
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
      } as AuthError;
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
        } as AuthError;
      }

      const donorProfilePayload = {
        user_id: donorUser.id,
        blood_type: input.blood_type ?? null,
        phone_number: input.phone_number ?? null,
        province: input.province ?? null,
        city: input.city ?? null,
        health_info: {},
      };

      const { error: donorProfileError } = await (supabaseService.from('donor_profiles') as any)
        .upsert(donorProfilePayload, { onConflict: 'user_id' });

      if (donorProfileError) {
        throw {
          code: 'DONOR_PROFILE_CREATE_FAILED',
          message: 'Failed to create donor profile.',
          details: donorProfileError,
        } as AuthError;
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
