import type { User } from '@supabase/supabase-js';
import { supabase, supabaseServer } from './supabase.client';
import type { AuthenticatedUser, TypedSupabaseClient } from './supabase.types';

export async function getCurrentUser(
  accessToken?: string,
  client: TypedSupabaseClient = supabase
): Promise<User | null> {
  const token = accessToken?.trim();
  const { data, error } = token ? await client.auth.getUser(token) : await client.auth.getUser();

  if (error) {
    throw new Error(`[supabase] Failed to fetch current user: ${error.message}`);
  }

  return data.user ?? null;
}

export async function isAuthenticated(
  accessToken?: string,
  client: TypedSupabaseClient = supabase
): Promise<boolean> {
  try {
    const user = await getCurrentUser(accessToken, client);
    return Boolean(user?.id);
  } catch {
    return false;
  }
}

export async function requireAuthenticatedUser(
  accessToken?: string,
  client: TypedSupabaseClient = supabase
): Promise<User> {
  const user = await getCurrentUser(accessToken, client);

  if (!user) {
    throw new Error('[supabase] Authentication required: no active user found.');
  }

  return user;
}

export async function getCurrentUserId(
  accessToken?: string,
  client: TypedSupabaseClient = supabase
): Promise<string | null> {
  const user = await getCurrentUser(accessToken, client);
  return user?.id ?? null;
}

export async function getCurrentSession(
  client: TypedSupabaseClient = supabase
): Promise<Awaited<ReturnType<typeof client.auth.getSession>>['data']['session'] | null> {
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw new Error(`[supabase] Failed to fetch session: ${error.message}`);
  }

  return data.session ?? null;
}

export async function getAuthenticatedUserSummary(
  accessToken?: string,
  client: TypedSupabaseClient = supabase
): Promise<AuthenticatedUser | null> {
  const user = await getCurrentUser(accessToken, client);

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    role: typeof user.role === 'string' ? user.role : null,
    appMetadata: (user.app_metadata ?? {}) as Record<string, unknown>,
    userMetadata: (user.user_metadata ?? {}) as Record<string, unknown>,
  };
}

export async function isAdmin(
  accessToken?: string,
  client: TypedSupabaseClient = supabase
): Promise<boolean> {
  const summary = await getAuthenticatedUserSummary(accessToken, client);

  if (!summary) {
    return false;
  }

  const appRole = typeof summary.appMetadata.role === 'string' ? summary.appMetadata.role : null;
  const userRole = typeof summary.userMetadata.role === 'string' ? summary.userMetadata.role : null;
  const role = (appRole ?? userRole ?? summary.role ?? '').toLowerCase();

  return role === 'admin' || role === 'super_admin' || role === 'owner';
}

export async function getUserByIdForAdmin(userId: string): Promise<User | null> {
  const normalizedId = userId.trim();

  if (!normalizedId) {
    throw new Error('[supabase] userId is required for getUserByIdForAdmin.');
  }

  const { data, error } = await supabaseServer.auth.admin.getUserById(normalizedId);

  if (error) {
    throw new Error(`[supabase] Failed to fetch user by id: ${error.message}`);
  }

  return data.user ?? null;
}
