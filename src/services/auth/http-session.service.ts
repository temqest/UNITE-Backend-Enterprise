import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '../../lib/supabase/supabase.client';
import type { LoginResponse, SessionUser } from './auth.types';
import { AuthErrorCode } from './auth.types';
import { getCurrentUser, getUserOrganization } from './session.service';

const refreshCookieName = process.env.AUTH_REFRESH_COOKIE_NAME?.trim() || 'unite_refresh_token';
const sameSite = normalizeSameSite(process.env.AUTH_COOKIE_SAME_SITE);
const sessionMaxAgeDays = parsePositiveInt(process.env.SESSION_MAX_AGE_DAYS, 7);
const refreshMaxAgeMs = sessionMaxAgeDays * 24 * 60 * 60 * 1000;

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY)!;
const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
const refreshSessionStore = supabaseServer as any;

type SameSite = 'lax' | 'strict' | 'none';

interface RefreshSessionRow {
  id: string;
  user_id: string;
  auth_user_id: string;
  refresh_token_hash: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface RequestSessionMetadata {
  userAgent?: string;
  ipAddress?: string;
}

export interface RefreshResult {
  session: LoginResponse;
  refreshToken: string;
}

export interface RefreshSessionPersistenceResult {
  ok: boolean;
  warning?: {
    code: string;
    message: string;
  };
}

function normalizeSameSite(value?: string): SameSite {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'strict' || normalized === 'none') {
    return normalized;
  }
  if (!value && process.env.NODE_ENV === 'production') {
    return 'none';
  }
  return 'lax';
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}

function decodeJwtPayload(token?: string): Record<string, unknown> {
  if (!token) {
    return {};
  }

  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return {};
    }
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getSessionIdFromAccessToken(accessToken?: string): string | null {
  const payload = decodeJwtPayload(accessToken);
  const value = payload.session_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function safeSession(session: LoginResponse): LoginResponse {
  const { refreshToken: _refreshToken, ...rest } = session;
  return rest;
}

function buildCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite,
    path: '/api/v1/auth',
    maxAge: refreshMaxAgeMs,
  } as const;
}

function parseCookieHeader(cookieHeader: unknown): Record<string, string> {
  if (typeof cookieHeader !== 'string' || cookieHeader.trim().length === 0) {
    return {};
  }

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName) {
      return acc;
    }
    acc[decodeURIComponent(rawName)] = decodeURIComponent(rawValue.join('='));
    return acc;
  }, {});
}

function extractIpAddress(value?: string): string | undefined {
  const first = value?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : undefined;
}

export function getRefreshCookieName(): string {
  return refreshCookieName;
}

export function getRefreshTokenFromRequest(req: Request): string | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  const token = cookies[refreshCookieName];
  return typeof token === 'string' && token.length > 0 ? token : null;
}

export function getRequestSessionMetadata(req: Request): RequestSessionMetadata {
  return {
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    ipAddress: extractIpAddress(typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : req.ip),
  };
}

export function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(refreshCookieName, refreshToken, buildCookieOptions());
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(refreshCookieName, {
    path: '/api/v1/auth',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite,
  });
}

export async function createAppRefreshSession(
  user: SessionUser,
  refreshToken: string,
  accessToken: string,
  metadata: RequestSessionMetadata = {}
): Promise<void> {
  const expiresAt = new Date(Date.now() + refreshMaxAgeMs).toISOString();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const supabaseSessionId = getSessionIdFromAccessToken(accessToken);

  const { error } = await refreshSessionStore
    .from('app_refresh_sessions')
    .insert({
      user_id: user.id,
      auth_user_id: user.auth_id ?? user.id,
      refresh_token_hash: refreshTokenHash,
      supabase_session_id: supabaseSessionId,
      expires_at: expiresAt,
      user_agent: metadata.userAgent,
      ip_address: metadata.ipAddress,
    });

  if (error) {
    throw {
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: 'Failed to create refresh session.',
      details: error,
    };
  }
}

export async function tryCreateAppRefreshSession(
  user: SessionUser,
  refreshToken: string,
  accessToken: string,
  metadata: RequestSessionMetadata = {}
): Promise<RefreshSessionPersistenceResult> {
  try {
    await createAppRefreshSession(user, refreshToken, accessToken, metadata);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (process.env.NODE_ENV !== 'production') {
      console.warn('[auth] Refresh session persistence failed; continuing without refresh cookie.', error);
    }

    return {
      ok: false,
      warning: {
        code: 'REFRESH_SESSION_PERSIST_FAILED',
        message: message || 'Failed to persist refresh session.',
      },
    };
  }
}

async function findActiveRefreshSession(refreshToken: string): Promise<RefreshSessionRow | null> {
  const { data, error } = await refreshSessionStore
    .from('app_refresh_sessions')
    .select('id, user_id, auth_user_id, refresh_token_hash, expires_at, revoked_at')
    .eq('refresh_token_hash', hashRefreshToken(refreshToken))
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as RefreshSessionRow;
  if (row.revoked_at || Date.parse(row.expires_at) <= Date.now()) {
    return null;
  }

  return row;
}

async function revokeRefreshSessionByToken(refreshToken: string, reason: string): Promise<void> {
  await refreshSessionStore
    .from('app_refresh_sessions')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: reason,
    })
    .eq('refresh_token_hash', hashRefreshToken(refreshToken))
    .is('revoked_at', null);
}

export async function revokeRefreshSessionFromRequest(req: Request, reason = 'logout'): Promise<void> {
  const refreshToken = getRefreshTokenFromRequest(req);
  if (!refreshToken) {
    return;
  }
  await revokeRefreshSessionByToken(refreshToken, reason);
}

export async function revokeSupabaseSessionFromRequest(req: Request): Promise<void> {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return;
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    return;
  }

  try {
    await supabaseServer.auth.admin.signOut(accessToken, 'local');
  } catch {
    // Logout should always clear the app refresh cookie even if Supabase
    // already considers the access token expired or revoked.
  }
}

export async function refreshAppSessionFromRequest(req: Request): Promise<RefreshResult> {
  const currentRefreshToken = getRefreshTokenFromRequest(req);
  if (!currentRefreshToken) {
    throw {
      code: AuthErrorCode.SESSION_EXPIRED,
      message: 'Session expired. Please sign in again.',
    };
  }

  const existing = await findActiveRefreshSession(currentRefreshToken);
  if (!existing) {
    throw {
      code: AuthErrorCode.SESSION_EXPIRED,
      message: 'Session expired. Please sign in again.',
    };
  }

  const { data, error } = await supabaseAuth.auth.refreshSession({
    refresh_token: currentRefreshToken,
  });

  if (error || !data.session?.access_token || !data.session.refresh_token) {
    await revokeRefreshSessionByToken(currentRefreshToken, 'refresh_failed');
    throw {
      code: AuthErrorCode.SESSION_EXPIRED,
      message: 'Session expired. Please sign in again.',
      details: error,
    };
  }

  const user = await getCurrentUser(data.session.access_token);
  if (!user || user.id !== existing.user_id || (user.auth_id && user.auth_id !== existing.auth_user_id)) {
    await revokeRefreshSessionByToken(currentRefreshToken, 'user_mismatch');
    throw {
      code: AuthErrorCode.SESSION_EXPIRED,
      message: 'Session expired. Please sign in again.',
    };
  }

  const organization = user.org_id ? await getUserOrganization(user.org_id) : null;
  const nextRefreshToken = data.session.refresh_token;
  const nextExpiresAt = new Date(Date.now() + refreshMaxAgeMs).toISOString();
  const { error: updateError } = await refreshSessionStore
    .from('app_refresh_sessions')
    .update({
      refresh_token_hash: hashRefreshToken(nextRefreshToken),
      supabase_session_id: getSessionIdFromAccessToken(data.session.access_token),
      expires_at: nextExpiresAt,
      revoked_at: null,
      revoked_reason: null,
    })
    .eq('id', existing.id);

  if (updateError) {
    throw {
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: 'Failed to rotate refresh session.',
      details: updateError,
    };
  }

  return {
    refreshToken: nextRefreshToken,
    session: safeSession({
      user,
      organization: organization ?? undefined,
      accessToken: data.session.access_token,
      refreshToken: nextRefreshToken,
      redirectTo: String(user.role?.type ?? '').toLowerCase() === 'donor' ? '/donor/dashboard' : '/dashboard',
    }),
  };
}

export function stripRefreshToken<T extends { refreshToken?: string }>(payload: T): Omit<T, 'refreshToken'> {
  const { refreshToken: _refreshToken, ...rest } = payload;
  return rest;
}
