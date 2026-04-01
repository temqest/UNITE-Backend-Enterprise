"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentUser = getCurrentUser;
exports.isAuthenticated = isAuthenticated;
exports.requireAuthenticatedUser = requireAuthenticatedUser;
exports.getCurrentUserId = getCurrentUserId;
exports.getCurrentSession = getCurrentSession;
exports.getAuthenticatedUserSummary = getAuthenticatedUserSummary;
exports.isAdmin = isAdmin;
exports.getUserByIdForAdmin = getUserByIdForAdmin;
const supabase_client_1 = require("./supabase.client");
async function getCurrentUser(accessToken, client = supabase_client_1.supabase) {
    const token = accessToken?.trim();
    const { data, error } = token ? await client.auth.getUser(token) : await client.auth.getUser();
    if (error) {
        throw new Error(`[supabase] Failed to fetch current user: ${error.message}`);
    }
    return data.user ?? null;
}
async function isAuthenticated(accessToken, client = supabase_client_1.supabase) {
    try {
        const user = await getCurrentUser(accessToken, client);
        return Boolean(user?.id);
    }
    catch {
        return false;
    }
}
async function requireAuthenticatedUser(accessToken, client = supabase_client_1.supabase) {
    const user = await getCurrentUser(accessToken, client);
    if (!user) {
        throw new Error('[supabase] Authentication required: no active user found.');
    }
    return user;
}
async function getCurrentUserId(accessToken, client = supabase_client_1.supabase) {
    const user = await getCurrentUser(accessToken, client);
    return user?.id ?? null;
}
async function getCurrentSession(client = supabase_client_1.supabase) {
    const { data, error } = await client.auth.getSession();
    if (error) {
        throw new Error(`[supabase] Failed to fetch session: ${error.message}`);
    }
    return data.session ?? null;
}
async function getAuthenticatedUserSummary(accessToken, client = supabase_client_1.supabase) {
    const user = await getCurrentUser(accessToken, client);
    if (!user) {
        return null;
    }
    return {
        id: user.id,
        email: user.email ?? null,
        role: typeof user.role === 'string' ? user.role : null,
        appMetadata: (user.app_metadata ?? {}),
        userMetadata: (user.user_metadata ?? {}),
    };
}
async function isAdmin(accessToken, client = supabase_client_1.supabase) {
    const summary = await getAuthenticatedUserSummary(accessToken, client);
    if (!summary) {
        return false;
    }
    const appRole = typeof summary.appMetadata.role === 'string' ? summary.appMetadata.role : null;
    const userRole = typeof summary.userMetadata.role === 'string' ? summary.userMetadata.role : null;
    const role = (appRole ?? userRole ?? summary.role ?? '').toLowerCase();
    return role === 'admin' || role === 'super_admin' || role === 'owner';
}
async function getUserByIdForAdmin(userId) {
    const normalizedId = userId.trim();
    if (!normalizedId) {
        throw new Error('[supabase] userId is required for getUserByIdForAdmin.');
    }
    const { data, error } = await supabase_client_1.supabaseServer.auth.admin.getUserById(normalizedId);
    if (error) {
        throw new Error(`[supabase] Failed to fetch user by id: ${error.message}`);
    }
    return data.user ?? null;
}
