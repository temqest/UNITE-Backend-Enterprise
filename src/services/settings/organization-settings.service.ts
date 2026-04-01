import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OrganizationSettingsRow,
  OrganizationSettingsCreateInput,
  OrganizationSettingsUpdateInput,
} from '../../models/organization_settings/types';
import type {
  ServiceError,
  ServiceResult,
  OrganizationSettingsSafe,
  OrganizationSettingsUpdateContext,
} from './types';
import { DEFAULT_ORG_SETTINGS } from './types';
import {
  validateOrgSettingsCreate,
  validateOrgSettingsUpdate,
} from './validators';

/**
 * Utility to create a ServiceError.
 */
function toServiceError(code: string, message: string, details?: unknown): ServiceError {
  return { code, message, details };
}

/**
 * Utility to apply default values to organization settings.
 */
function applyDefaults(partial: Partial<OrganizationSettingsRow>): OrganizationSettingsSafe {
  return {
    id: partial.id || '',
    org_id: partial.org_id || '',
    max_blood_bags_per_day: partial.max_blood_bags_per_day ?? DEFAULT_ORG_SETTINGS.max_blood_bags_per_day,
    max_events_per_day: partial.max_events_per_day ?? DEFAULT_ORG_SETTINGS.max_events_per_day,
    event_request_advance_days: partial.event_request_advance_days ?? DEFAULT_ORG_SETTINGS.event_request_advance_days,
    prevent_double_booking_same_day: partial.prevent_double_booking_same_day ?? DEFAULT_ORG_SETTINGS.prevent_double_booking_same_day,
    allow_weekend_events: partial.allow_weekend_events ?? DEFAULT_ORG_SETTINGS.allow_weekend_events,
    banned_days_of_week: partial.banned_days_of_week ?? DEFAULT_ORG_SETTINGS.banned_days_of_week,
    banned_specific_dates: partial.banned_specific_dates ?? DEFAULT_ORG_SETTINGS.banned_specific_dates,
    config: partial.config ?? DEFAULT_ORG_SETTINGS.config,
    created_at: partial.created_at || new Date().toISOString(),
    updated_at: partial.updated_at || new Date().toISOString(),
  };
}

/**
 * Service for managing organization-wide settings.
 * Handles get, create, and update operations with RLS enforcement.
 *
 * Requirements:
 * - RLS policy: organization_settings_select_rls (users can read own org settings)
 * - RLS policy: organization_settings_insert_rls (org_admin can insert on signup)
 * - RLS policy: organization_settings_update_rls (org_admin can update)
 */
export class OrganizationSettingsService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Gets organization settings by org_id with defaults applied.
   * Falls back to defaults if no row exists.
   *
   * @param org_id Organization ID
   * @returns ServiceResult with OrganizationSettingsSafe data
   */
  async getSettings(org_id: string): Promise<ServiceResult<OrganizationSettingsSafe>> {
    try {
      if (!org_id) {
        return {
          data: null,
          error: toServiceError('ORG_ID_MISSING', 'org_id is required'),
        };
      }

      const { data, error } = await this.supabase
        .from('organization_settings')
        .select('*')
        .eq('org_id', org_id)
        .single();

      if (error) {
        // PGRST116 = no rows found; return defaults instead of error
        if (error.code === 'PGRST116') {
          return {
            data: applyDefaults({ org_id }),
            error: null,
          };
        }

        return {
          data: null,
          error: toServiceError(
            'ORG_SETTINGS_FETCH_FAILED',
            'Failed to fetch organization settings',
            error
          ),
        };
      }

      return {
        data: applyDefaults(data as OrganizationSettingsRow),
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        error: toServiceError(
          'ORG_SETTINGS_FETCH_ERROR',
          'An unexpected error occurred while fetching settings',
          err
        ),
      };
    }
  }

  /**
   * Creates organization settings for a new organization.
   * Automatically called on organization signup.
   * Only callable by system or during org creation flow.
   *
   * @param input OrganizationSettingsCreateInput with org_id
   * @returns ServiceResult with created OrganizationSettingsSafe data
   */
  async createSettings(
    input: OrganizationSettingsCreateInput
  ): Promise<ServiceResult<OrganizationSettingsSafe>> {
    try {
      // Validate input
      const parsed = validateOrgSettingsCreate(input);

      // Check if settings already exist for this org
      const existing = await this.getSettings(parsed.org_id);
      if (existing.data && existing.data.id) {
        return {
          data: null,
          error: toServiceError(
            'ORG_SETTINGS_EXISTS',
            'Settings already exist for this organization'
          ),
        };
      }

      const { data, error } = await this.supabase
        .from('organization_settings')
        .insert({
          org_id: parsed.org_id,
          max_blood_bags_per_day: parsed.max_blood_bags_per_day ?? DEFAULT_ORG_SETTINGS.max_blood_bags_per_day,
          max_events_per_day: parsed.max_events_per_day ?? DEFAULT_ORG_SETTINGS.max_events_per_day,
          event_request_advance_days: parsed.event_request_advance_days ?? DEFAULT_ORG_SETTINGS.event_request_advance_days,
          prevent_double_booking_same_day: parsed.prevent_double_booking_same_day ?? DEFAULT_ORG_SETTINGS.prevent_double_booking_same_day,
          allow_weekend_events: parsed.allow_weekend_events ?? DEFAULT_ORG_SETTINGS.allow_weekend_events,
          banned_days_of_week: parsed.banned_days_of_week ?? DEFAULT_ORG_SETTINGS.banned_days_of_week,
          banned_specific_dates: parsed.banned_specific_dates ?? DEFAULT_ORG_SETTINGS.banned_specific_dates,
          config: parsed.config ?? DEFAULT_ORG_SETTINGS.config,
        })
        .select('*')
        .single();

      if (error) {
        if (error.code === '23514') {
          const errorDetails = (error as { message?: string; details?: string | null; constraint?: string | null });
          const constraintText = `${errorDetails.constraint ?? ''} ${errorDetails.message ?? ''} ${errorDetails.details ?? ''}`;

          if (constraintText.includes('organization_settings_banned_specific_dates_valid')) {
            return {
              data: null,
              error: toServiceError(
                'ORG_SETTINGS_INVALID_BANNED_DATES',
                'Invalid banned specific dates format. Dates must be valid YYYY-MM-DD values.',
                error
              ),
            };
          }
        }

        return {
          data: null,
          error: toServiceError(
            'ORG_SETTINGS_CREATE_FAILED',
            'Failed to create organization settings',
            error
          ),
        };
      }

      return {
        data: applyDefaults(data as OrganizationSettingsRow),
        error: null,
      };
    } catch (err) {
      // Zod validation or other errors
      return {
        data: null,
        error: toServiceError(
          'ORG_SETTINGS_CREATE_VALIDATION_ERROR',
          'Invalid organization settings payload',
          err
        ),
      };
    }
  }

  /**
   * Updates organization settings.
   * Requires org_admin role (validated by RLS policy).
   * Updated_by_user_id is used for audit trail + RLS validation.
   *
   * @param org_id Organization ID to update
   * @param input OrganizationSettingsUpdateInput with values to update
   * @param updated_by_user_id User ID performing the update (for audit + RLS)
   * @returns ServiceResult with updated OrganizationSettingsSafe data
   */
  async updateSettings(
    org_id: string,
    input: OrganizationSettingsUpdateInput,
    updated_by_user_id: string
  ): Promise<ServiceResult<OrganizationSettingsSafe>> {
    try {
      if (!org_id) {
        return {
          data: null,
          error: toServiceError('ORG_ID_MISSING', 'org_id is required'),
        };
      }

      if (!updated_by_user_id) {
        return {
          data: null,
          error: toServiceError(
            'USER_ID_MISSING',
            'updated_by_user_id is required for audit trail'
          ),
        };
      }

      // Validate input
      const parsed = validateOrgSettingsUpdate(input);

      // Build update object with only non-undefined values
      const updateData: Record<string, unknown> = {};
      if (parsed.max_blood_bags_per_day !== undefined) {
        updateData.max_blood_bags_per_day = parsed.max_blood_bags_per_day;
      }
      if (parsed.max_events_per_day !== undefined) {
        updateData.max_events_per_day = parsed.max_events_per_day;
      }
      if (parsed.event_request_advance_days !== undefined) {
        updateData.event_request_advance_days = parsed.event_request_advance_days;
      }
      if (parsed.prevent_double_booking_same_day !== undefined) {
        updateData.prevent_double_booking_same_day = parsed.prevent_double_booking_same_day;
      }
      if (parsed.allow_weekend_events !== undefined) {
        updateData.allow_weekend_events = parsed.allow_weekend_events;
      }
      if (parsed.banned_days_of_week !== undefined) {
        updateData.banned_days_of_week = parsed.banned_days_of_week;
      }
      if (parsed.banned_specific_dates !== undefined) {
        updateData.banned_specific_dates = parsed.banned_specific_dates;
      }
      if (parsed.config !== undefined) {
        updateData.config = parsed.config;
      }

      const { data, error } = await this.supabase
        .from('organization_settings')
        .update(updateData)
        .eq('org_id', org_id)
        .select('*')
        .single();

      if (error) {
        // PGRST116 = no rows found
        if (error.code === 'PGRST116') {
          // Initialize settings on first update attempt when no row exists yet.
          return this.createSettings({
            org_id,
            ...parsed,
          });
        }

        if (error.code === '23514') {
          const errorDetails = (error as { message?: string; details?: string | null; constraint?: string | null });
          const constraintText = `${errorDetails.constraint ?? ''} ${errorDetails.message ?? ''} ${errorDetails.details ?? ''}`;

          if (constraintText.includes('organization_settings_banned_specific_dates_valid')) {
            return {
              data: null,
              error: toServiceError(
                'ORG_SETTINGS_INVALID_BANNED_DATES',
                'Invalid banned specific dates format. Dates must be valid YYYY-MM-DD values.',
                error
              ),
            };
          }
        }

        return {
          data: null,
          error: toServiceError(
            'ORG_SETTINGS_UPDATE_FAILED',
            'Failed to update organization settings',
            error
          ),
        };
      }

      return {
        data: applyDefaults(data as OrganizationSettingsRow),
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        error: toServiceError(
          'ORG_SETTINGS_UPDATE_VALIDATION_ERROR',
          'Invalid update payload',
          err
        ),
      };
    }
  }

  /**
   * Gets settings with defaults merged, ensuring all fields are present.
   * Useful for safe consumption in business logic.
   *
   * @param org_id Organization ID
   * @returns Settings with all defaults guaranteed
   */
  async getSettingsWithDefaults(org_id: string): Promise<ServiceResult<OrganizationSettingsSafe>> {
    return this.getSettings(org_id);
  }
}
