import { createClient } from '@supabase/supabase-js';
import type { SupabaseClientOptions } from '@supabase/supabase-js';
import type { Database, SupabaseRuntimeConfig, TypedSupabaseClient } from './supabase.types';

let dotenvLoaded = false;

function loadDotenvIfAvailable(): void {
  if (dotenvLoaded) {
    return;
  }

  try {
    require('dotenv').config({ quiet: true });
  } catch {
    if ((process.env.NODE_ENV ?? 'development') !== 'production') {
      console.warn('[supabase] dotenv package not found; relying on existing process.env values.');
    }
  }

  dotenvLoaded = true;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireEnv(name: string, fallbackName?: string): string {
  const value = readEnv(name) ?? (fallbackName ? readEnv(fallbackName) : undefined);

  if (!value) {
    const target = fallbackName ? `${name} (or ${fallbackName})` : name;
    throw new Error(`[supabase] Missing required environment variable: ${target}`);
  }

  return value;
}

function resolveEnv(...names: string[]): { value: string | undefined; source: string | undefined } {
  for (const name of names) {
    const value = readEnv(name);
    if (value) {
      return { value, source: name };
    }
  }

  return { value: undefined, source: undefined };
}

function resolveConfig(): SupabaseRuntimeConfig {
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
    throw new Error(
      '[supabase] Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY (or SUPABSE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY)'
    );
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

const browserClientOptions: SupabaseClientOptions<'public'> = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
};

const serverClientOptions: SupabaseClientOptions<'public'> = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

export const supabase: TypedSupabaseClient = createClient<Database>(
  runtimeConfig.url,
  runtimeConfig.anonKey,
  browserClientOptions
);

export const supabaseServer: TypedSupabaseClient = createClient<Database>(
  runtimeConfig.url,
  runtimeConfig.serviceRoleKey,
  serverClientOptions
);

export const supabaseAdmin = supabaseServer;
export const supabaseService = supabaseServer;

export function createServerClient(serviceRoleKey?: string): TypedSupabaseClient {
  const key = serviceRoleKey?.trim() || runtimeConfig.serviceRoleKey;

  if (!key) {
    throw new Error('[supabase] Cannot create server client without service role key.');
  }

  return createClient<Database>(runtimeConfig.url, key, serverClientOptions);
}

export function getSupabaseConfig(): Readonly<SupabaseRuntimeConfig> {
  return Object.freeze({ ...runtimeConfig });
}
