import type { SupabaseClient } from '@supabase/supabase-js';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, unknown>;
    Views: Record<string, unknown>;
    Functions: Record<string, unknown>;
    Enums: Record<string, unknown>;
    CompositeTypes: Record<string, unknown>;
  };
};

export type TypedSupabaseClient = SupabaseClient<Database>;

export type SupabaseRuntimeConfig = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  projectId?: string;
  nodeEnv: string;
};

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  role: string | null;
  appMetadata: Record<string, unknown>;
  userMetadata: Record<string, unknown>;
};
