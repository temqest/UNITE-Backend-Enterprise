import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  UserSettingsRow,
  UserSettingsCreateInput,
  UserSettingsUpdateInput,
} from '../../models/user_settings/types';
import type { ServiceError, ServiceResult } from './types';
import { DEFAULT_USER_SETTINGS } from './types';
import {
  validateUserSettingsCreate,
  validateUserSettingsUpdate,
} from './validators';

/**
 * Utility to create a ServiceError.
 */
function toServiceError(code: string, message: string, details?: unknown): ServiceError {
  return { code, message, details };
}

/**
 * Utility to apply default values to user settings.
 */
function applyDefaults(partial: Partial<UserSettingsRow>): UserSettingsRow {
  return {
    id: partial.id || '',
    org_id: partial.org_id || '',
    user_id: partial.user_id || '',
    enable_email_notifications: partial.enable_email_notifications ?? DEFAULT_USER_SETTINGS.enable_email_notifications,
    enable_in_app_notifications: partial.enable_in_app_notifications ?? DEFAULT_USER_SETTINGS.enable_in_app_notifications,
    enable_all_notifications: partial.enable_all_notifications ?? DEFAULT_USER_SETTINGS.enable_all_notifications,
    preferences: partial.preferences ?? DEFAULT_USER_SETTINGS.preferences,
    created_at: partial.created_at || new Date().toISOString(),
    updated_at: partial.updated_at || new Date().toISOString(),
  };
}

/**
 * Service for managing user-specific settings and notification preferences.
 * Handles get, create, and update operations with RLS enforcement.
 *
 * Requirements:
 * - RLS policy: user_settings_select_rls (users can read own settings)
 * - RLS policy: user_settings_insert_rls (users can insert own settings on signup)
 * - RLS policy: user_settings_update_rls (users can update own settings)
 */
export class UserSettingsService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Gets user settings by user_id with defaults applied.
   * Falls back to defaults if no row exists.
   *
   * @param user_id User ID
   * @returns ServiceResult with UserSettingsRow data (with defaults applied)
   */
  async getSettings(user_id: string): Promise<ServiceResult<UserSettingsRow>> {
    try {
      if (!user_id) {
        return {
          data: null,
          error: toServiceError('USER_ID_MISSING', 'user_id is required'),
        };
      }

      const { data, error } = await this.supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user_id)
        .single();

      if (error) {
        // PGRST116 = no rows found; return defaults instead of error
        if (error.code === 'PGRST116') {
          return {
            data: applyDefaults({ user_id }),
            error: null,
          };
        }

        return {
          data: null,
          error: toServiceError(
            'USER_SETTINGS_FETCH_FAILED',
            'Failed to fetch user settings',
            error
          ),
        };
      }

      return {
        data: applyDefaults(data as UserSettingsRow),
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        error: toServiceError(
          'USER_SETTINGS_FETCH_ERROR',
          'An unexpected error occurred while fetching settings',
          err
        ),
      };
    }
  }

  /**
   * Gets user settings by user_id and org_id.
   * More restrictive query for explicit org context.
   *
   * @param org_id Organization ID
   * @param user_id User ID
   * @returns ServiceResult with UserSettingsRow data (with defaults applied)
   */
  async getSettingsByOrgAndUser(
    org_id: string,
    user_id: string
  ): Promise<ServiceResult<UserSettingsRow>> {
    try {
      if (!org_id) {
        return {
          data: null,
          error: toServiceError('ORG_ID_MISSING', 'org_id is required'),
        };
      }

      if (!user_id) {
        return {
          data: null,
          error: toServiceError('USER_ID_MISSING', 'user_id is required'),
        };
      }

      const { data, error } = await this.supabase
        .from('user_settings')
        .select('*')
        .eq('org_id', org_id)
        .eq('user_id', user_id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return {
            data: applyDefaults({ org_id, user_id }),
            error: null,
          };
        }

        return {
          data: null,
          error: toServiceError(
            'USER_SETTINGS_FETCH_FAILED',
            'Failed to fetch user settings',
            error
          ),
        };
      }

      return {
        data: applyDefaults(data as UserSettingsRow),
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        error: toServiceError(
          'USER_SETTINGS_FETCH_ERROR',
          'An unexpected error occurred while fetching settings',
          err
        ),
      };
    }
  }

  /**
   * Creates user settings for a new user.
   * Automatically called on user signup.
   *
   * @param input UserSettingsCreateInput with org_id and user_id
   * @returns ServiceResult with created UserSettingsRow data
   */
  async createSettings(
    input: UserSettingsCreateInput
  ): Promise<ServiceResult<UserSettingsRow>> {
    try {
      // Validate input
      const parsed = validateUserSettingsCreate(input);

      // Check if settings already exist for this user
      const existing = await this.getSettings(parsed.user_id);
      if (existing.data && existing.data.id) {
        return {
          data: null,
          error: toServiceError(
            'USER_SETTINGS_EXISTS',
            'Settings already exist for this user'
          ),
        };
      }

      const { data, error } = await this.supabase
        .from('user_settings')
        .insert({
          org_id: parsed.org_id,
          user_id: parsed.user_id,
          enable_email_notifications: parsed.enable_email_notifications ?? DEFAULT_USER_SETTINGS.enable_email_notifications,
          enable_in_app_notifications: parsed.enable_in_app_notifications ?? DEFAULT_USER_SETTINGS.enable_in_app_notifications,
          enable_all_notifications: parsed.enable_all_notifications ?? DEFAULT_USER_SETTINGS.enable_all_notifications,
          preferences: parsed.preferences ?? DEFAULT_USER_SETTINGS.preferences,
        })
        .select('*')
        .single();

      if (error) {
        return {
          data: null,
          error: toServiceError(
            'USER_SETTINGS_CREATE_FAILED',
            'Failed to create user settings',
            error
          ),
        };
      }

      return {
        data: applyDefaults(data as UserSettingsRow),
        error: null,
      };
    } catch (err) {
      // Zod validation or other errors
      return {
        data: null,
        error: toServiceError(
          'USER_SETTINGS_CREATE_VALIDATION_ERROR',
          'Invalid user settings payload',
          err
        ),
      };
    }
  }

  /**
   * Updates user settings.
   * User can update their own settings (enforced by RLS).
   *
   * @param user_id User ID to update
   * @param input UserSettingsUpdateInput with values to update
   * @returns ServiceResult with updated UserSettingsRow data
   */
  async updateSettings(
    user_id: string,
    input: UserSettingsUpdateInput
  ): Promise<ServiceResult<UserSettingsRow>> {
    try {
      if (!user_id) {
        return {
          data: null,
          error: toServiceError('USER_ID_MISSING', 'user_id is required'),
        };
      }

      // Validate input
      const parsed = validateUserSettingsUpdate(input);

      // Build update object with only non-undefined values
      const updateData: Record<string, unknown> = {};
      if (parsed.enable_email_notifications !== undefined) {
        updateData.enable_email_notifications = parsed.enable_email_notifications;
      }
      if (parsed.enable_in_app_notifications !== undefined) {
        updateData.enable_in_app_notifications = parsed.enable_in_app_notifications;
      }
      if (parsed.enable_all_notifications !== undefined) {
        updateData.enable_all_notifications = parsed.enable_all_notifications;
      }
      if (parsed.preferences !== undefined) {
        updateData.preferences = parsed.preferences;
      }

      const { data, error } = await this.supabase
        .from('user_settings')
        .update(updateData)
        .eq('user_id', user_id)
        .select('*')
        .single();

      if (error) {
        // PGRST116 = no rows found
        if (error.code === 'PGRST116') {
          return {
            data: null,
            error: toServiceError(
              'USER_SETTINGS_NOT_FOUND',
              'User settings not found'
            ),
          };
        }

        return {
          data: null,
          error: toServiceError(
            'USER_SETTINGS_UPDATE_FAILED',
            'Failed to update user settings',
            error
          ),
        };
      }

      return {
        data: applyDefaults(data as UserSettingsRow),
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        error: toServiceError(
          'USER_SETTINGS_UPDATE_VALIDATION_ERROR',
          'Invalid update payload',
          err
        ),
      };
    }
  }

  /**
   * Checks if user has notifications enabled.
   * Respects enable_all_notifications override and individual toggles.
   *
   * @param user_id User ID
   * @param channel Channel to check ('email' | 'in_app')
   * @returns true if notifications are enabled for the channel
   */
  async isNotificationChannelEnabled(
    user_id: string,
    channel: 'email' | 'in_app'
  ): Promise<boolean> {
    const result = await this.getSettings(user_id);
    if (result.error || !result.data) {
      return DEFAULT_USER_SETTINGS.enable_all_notifications;
    }

    const { data } = result;

    // If enable_all_notifications is false, respect individual toggles
    if (!data.enable_all_notifications) {
      if (channel === 'email') {
        return data.enable_email_notifications;
      }
      return data.enable_in_app_notifications;
    }

    // If enable_all_notifications is true, allow all channels
    // (unless explicitly disabled, but enable_all takes precedence)
    return true;
  }

  /**
   * Sets all notification channels to a single state.
   * Useful for bulk enable/disable.
   *
   * @param user_id User ID
   * @param enabled Enable or disable all channels
   * @returns ServiceResult with updated UserSettingsRow data
   */
  async setAllNotificationsState(
    user_id: string,
    enabled: boolean
  ): Promise<ServiceResult<UserSettingsRow>> {
    return this.updateSettings(user_id, {
      enable_all_notifications: enabled,
      enable_email_notifications: enabled,
      enable_in_app_notifications: enabled,
    });
  }

  /**
   * Gets settings with defaults merged, ensuring all fields are present.
   * Useful for safe consumption in business logic.
   *
   * @param user_id User ID
   * @returns Settings with all defaults guaranteed
   */
  async getSettingsWithDefaults(user_id: string): Promise<ServiceResult<UserSettingsRow>> {
    return this.getSettings(user_id);
  }
}
