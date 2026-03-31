/**
 * Logout Service
 * Handles session cleanup and user logout
 */

import { createClient } from '@supabase/supabase-js';
import { AuthError, AuthErrorCode } from './auth.types';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Logout the current user
 */
export async function logout(): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw {
        code: AuthErrorCode.UNKNOWN_ERROR,
        message: 'Failed to logout',
        details: error,
      } as AuthError;
    }

    return {
      success: true,
      message: 'Logged out successfully',
    };
  } catch (error) {
    if ((error as AuthError).code) {
      throw error;
    }
    throw {
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: 'An unexpected error occurred during logout',
      details: error,
    } as AuthError;
  }
}

/**
 * Logout from all devices (revoke all sessions)
 */
export async function logoutAllDevices(): Promise<{ success: boolean; message: string }> {
  try {
    // Sign out with global scope to revoke all sessions
    const { error } = await supabase.auth.signOut({ 
      scope: 'global' 
    });

    if (error) {
      throw {
        code: AuthErrorCode.UNKNOWN_ERROR,
        message: 'Failed to logout from all devices',
        details: error,
      } as AuthError;
    }

    return {
      success: true,
      message: 'Logged out from all devices successfully',
    };
  } catch (error) {
    if ((error as AuthError).code) {
      throw error;
    }
    throw {
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: 'An unexpected error occurred during logout',
      details: error,
    } as AuthError;
  }
}

/**
 * Clear local session data (client-side helper)
 * This is useful for cleanup in case of errors
 */
export async function clearLocalSession(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (error) {
    // Silently fail - this is just cleanup
    console.error('Failed to clear local session:', error);
  }
}
