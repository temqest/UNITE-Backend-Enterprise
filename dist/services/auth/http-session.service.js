"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRefreshCookieName = getRefreshCookieName;
exports.getRefreshTokenFromRequest = getRefreshTokenFromRequest;
exports.getRequestSessionMetadata = getRequestSessionMetadata;
exports.setRefreshCookie = setRefreshCookie;
exports.clearRefreshCookie = clearRefreshCookie;
exports.createAppRefreshSession = createAppRefreshSession;
exports.tryCreateAppRefreshSession = tryCreateAppRefreshSession;
exports.revokeRefreshSessionFromRequest = revokeRefreshSessionFromRequest;
exports.revokeSupabaseSessionFromRequest = revokeSupabaseSessionFromRequest;
exports.refreshAppSessionFromRequest = refreshAppSessionFromRequest;
exports.stripRefreshToken = stripRefreshToken;
const node_crypto_1 = require("node:crypto");
const supabase_js_1 = require("@supabase/supabase-js");
const supabase_client_1 = require("../../lib/supabase/supabase.client");
const auth_types_1 = require("./auth.types");
const session_service_1 = require("./session.service");
const refreshCookieName = process.env.AUTH_REFRESH_COOKIE_NAME?.trim() || 'unite_refresh_token';
const sameSite = normalizeSameSite(process.env.AUTH_COOKIE_SAME_SITE);
const sessionMaxAgeDays = parsePositiveInt(process.env.SESSION_MAX_AGE_DAYS, 7);
const refreshMaxAgeMs = sessionMaxAgeDays * 24 * 60 * 60 * 1000;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY);
const supabaseAuth = (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
});
const refreshSessionStore = supabase_client_1.supabaseServer;
function normalizeSameSite(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'strict' || normalized === 'none') {
        return normalized;
    }
    return 'lax';
}
function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function hashRefreshToken(refreshToken) {
    return (0, node_crypto_1.createHash)('sha256').update(refreshToken).digest('hex');
}
function decodeJwtPayload(token) {
    if (!token) {
        return {};
    }
    try {
        const [, payload] = token.split('.');
        if (!payload) {
            return {};
        }
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    }
    catch {
        return {};
    }
}
function getSessionIdFromAccessToken(accessToken) {
    const payload = decodeJwtPayload(accessToken);
    const value = payload.session_id;
    return typeof value === 'string' && value.length > 0 ? value : null;
}
function safeSession(session) {
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
    };
}
function parseCookieHeader(cookieHeader) {
    if (typeof cookieHeader !== 'string' || cookieHeader.trim().length === 0) {
        return {};
    }
    return cookieHeader.split(';').reduce((acc, part) => {
        const [rawName, ...rawValue] = part.trim().split('=');
        if (!rawName) {
            return acc;
        }
        acc[decodeURIComponent(rawName)] = decodeURIComponent(rawValue.join('='));
        return acc;
    }, {});
}
function extractIpAddress(value) {
    const first = value?.split(',')[0]?.trim();
    return first && first.length > 0 ? first : undefined;
}
function getRefreshCookieName() {
    return refreshCookieName;
}
function getRefreshTokenFromRequest(req) {
    const cookies = parseCookieHeader(req.headers.cookie);
    const token = cookies[refreshCookieName];
    return typeof token === 'string' && token.length > 0 ? token : null;
}
function getRequestSessionMetadata(req) {
    return {
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
        ipAddress: extractIpAddress(typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : req.ip),
    };
}
function setRefreshCookie(res, refreshToken) {
    res.cookie(refreshCookieName, refreshToken, buildCookieOptions());
}
function clearRefreshCookie(res) {
    res.clearCookie(refreshCookieName, {
        path: '/api/v1/auth',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite,
    });
}
async function createAppRefreshSession(user, refreshToken, accessToken, metadata = {}) {
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
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'Failed to create refresh session.',
            details: error,
        };
    }
}
async function tryCreateAppRefreshSession(user, refreshToken, accessToken, metadata = {}) {
    try {
        await createAppRefreshSession(user, refreshToken, accessToken, metadata);
        return { ok: true };
    }
    catch (error) {
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
async function findActiveRefreshSession(refreshToken) {
    const { data, error } = await refreshSessionStore
        .from('app_refresh_sessions')
        .select('id, user_id, auth_user_id, refresh_token_hash, expires_at, revoked_at')
        .eq('refresh_token_hash', hashRefreshToken(refreshToken))
        .maybeSingle();
    if (error || !data) {
        return null;
    }
    const row = data;
    if (row.revoked_at || Date.parse(row.expires_at) <= Date.now()) {
        return null;
    }
    return row;
}
async function revokeRefreshSessionByToken(refreshToken, reason) {
    await refreshSessionStore
        .from('app_refresh_sessions')
        .update({
        revoked_at: new Date().toISOString(),
        revoked_reason: reason,
    })
        .eq('refresh_token_hash', hashRefreshToken(refreshToken))
        .is('revoked_at', null);
}
async function revokeRefreshSessionFromRequest(req, reason = 'logout') {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) {
        return;
    }
    await revokeRefreshSessionByToken(refreshToken, reason);
}
async function revokeSupabaseSessionFromRequest(req) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        return;
    }
    const accessToken = authHeader.slice(7).trim();
    if (!accessToken) {
        return;
    }
    try {
        await supabase_client_1.supabaseServer.auth.admin.signOut(accessToken, 'local');
    }
    catch {
        // Logout should always clear the app refresh cookie even if Supabase
        // already considers the access token expired or revoked.
    }
}
async function refreshAppSessionFromRequest(req) {
    const currentRefreshToken = getRefreshTokenFromRequest(req);
    if (!currentRefreshToken) {
        throw {
            code: auth_types_1.AuthErrorCode.SESSION_EXPIRED,
            message: 'Session expired. Please sign in again.',
        };
    }
    const existing = await findActiveRefreshSession(currentRefreshToken);
    if (!existing) {
        throw {
            code: auth_types_1.AuthErrorCode.SESSION_EXPIRED,
            message: 'Session expired. Please sign in again.',
        };
    }
    const { data, error } = await supabaseAuth.auth.refreshSession({
        refresh_token: currentRefreshToken,
    });
    if (error || !data.session?.access_token || !data.session.refresh_token) {
        await revokeRefreshSessionByToken(currentRefreshToken, 'refresh_failed');
        throw {
            code: auth_types_1.AuthErrorCode.SESSION_EXPIRED,
            message: 'Session expired. Please sign in again.',
            details: error,
        };
    }
    const user = await (0, session_service_1.getCurrentUser)(data.session.access_token);
    if (!user || user.id !== existing.user_id || (user.auth_id && user.auth_id !== existing.auth_user_id)) {
        await revokeRefreshSessionByToken(currentRefreshToken, 'user_mismatch');
        throw {
            code: auth_types_1.AuthErrorCode.SESSION_EXPIRED,
            message: 'Session expired. Please sign in again.',
        };
    }
    const organization = user.org_id ? await (0, session_service_1.getUserOrganization)(user.org_id) : null;
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
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
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
function stripRefreshToken(payload) {
    const { refreshToken: _refreshToken, ...rest } = payload;
    return rest;
}
