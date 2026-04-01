"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseService = exports.supabaseAdmin = exports.supabaseServer = exports.supabase = void 0;
exports.createServerClient = createServerClient;
exports.getSupabaseConfig = getSupabaseConfig;
const supabase_js_1 = require("@supabase/supabase-js");
let dotenvLoaded = false;
function loadDotenvIfAvailable() {
    if (dotenvLoaded) {
        return;
    }
    try {
        require('dotenv').config({ quiet: true });
    }
    catch {
        if ((process.env.NODE_ENV ?? 'development') !== 'production') {
            console.warn('[supabase] dotenv package not found; relying on existing process.env values.');
        }
    }
    dotenvLoaded = true;
}
function readEnv(name) {
    const value = process.env[name];
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed.length > 0 ? trimmed : undefined;
}
function requireEnv(name, fallbackName) {
    const value = readEnv(name) ?? (fallbackName ? readEnv(fallbackName) : undefined);
    if (!value) {
        const target = fallbackName ? `${name} (or ${fallbackName})` : name;
        throw new Error(`[supabase] Missing required environment variable: ${target}`);
    }
    return value;
}
function resolveEnv(...names) {
    for (const name of names) {
        const value = readEnv(name);
        if (value) {
            return { value, source: name };
        }
    }
    return { value: undefined, source: undefined };
}
function resolveConfig() {
    loadDotenvIfAvailable();
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    const url = requireEnv('SUPABASE_URL');
    const anon = resolveEnv('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY');
    const service = resolveEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABSE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
    const anonKey = anon.value;
    const serviceRoleKey = service.value;
    if (!anonKey) {
        throw new Error('[supabase] Missing required environment variable: SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY)');
    }
    if (!serviceRoleKey) {
        throw new Error('[supabase] Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY (or SUPABSE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY)');
    }
    const projectId = readEnv('SUPABASE_ID');
    if (nodeEnv !== 'production' && !projectId) {
        // Optional project id can be omitted; URL is sufficient for client initialization.
    }
    return {
        url,
        anonKey,
        serviceRoleKey,
        projectId,
        nodeEnv,
    };
}
const runtimeConfig = resolveConfig();
const browserClientOptions = {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
    },
};
const serverClientOptions = {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
};
exports.supabase = (0, supabase_js_1.createClient)(runtimeConfig.url, runtimeConfig.anonKey, browserClientOptions);
exports.supabaseServer = (0, supabase_js_1.createClient)(runtimeConfig.url, runtimeConfig.serviceRoleKey, serverClientOptions);
exports.supabaseAdmin = exports.supabaseServer;
exports.supabaseService = exports.supabaseServer;
function createServerClient(serviceRoleKey) {
    const key = serviceRoleKey?.trim() || runtimeConfig.serviceRoleKey;
    if (!key) {
        throw new Error('[supabase] Cannot create server client without service role key.');
    }
    return (0, supabase_js_1.createClient)(runtimeConfig.url, key, serverClientOptions);
}
function getSupabaseConfig() {
    return Object.freeze({ ...runtimeConfig });
}
