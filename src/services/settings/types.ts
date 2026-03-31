import type {
  OrganizationSettingsRow,
  OrganizationSettingsConfig,
  OrganizationSettingsUpdateInput,
} from '../../models/organization_settings/types';
import type {
  UserSettingsRow,
  UserSettingsPreferences,
  UserSettingsUpdateInput,
} from '../../models/user_settings/types';

/**
 * Service-level error type for consistent error handling across all settings services.
 */
export interface ServiceError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Service-level result wrapper for operations with optional data and error.
 */
export interface ServiceResult<T> {
  data: T | null;
  error: ServiceError | null;
}

/**
 * Organization settings with defaults applied.
 * Safe to use directly in business logic.
 */
export interface OrganizationSettingsSafe extends OrganizationSettingsRow {}

/**
 * User settings with defaults applied.
 * Safe to use directly in business logic.
 */
export interface UserSettingsSafe extends UserSettingsRow {}

/**
 * Validation result for event-related constraints.
 */
export interface EventSettingsValidationResult {
  isValid: boolean;
  violations: string[];
}

/**
 * Context for validating events against organization settings.
 */
export interface EventValidationContext {
  org_id: string;
  requested_date: string; // ISO date string YYYY-MM-DD
  num_events_today?: number; // Number of events already created today
  is_weekend?: boolean; // If true, checked against allow_weekend_events
  previous_event_date?: string; // If provided, checked for double-booking prevention
}

/**
 * Constants for default settings values.
 */
export const DEFAULT_ORG_SETTINGS = {
  max_blood_bags_per_day: 100,
  max_events_per_day: 5,
  event_request_advance_days: 3,
  prevent_double_booking_same_day: true,
  allow_weekend_events: false,
  banned_days_of_week: [] as number[],
  banned_specific_dates: [] as string[],
  config: {} as OrganizationSettingsConfig,
};

/**
 * Constants for default user settings values.
 */
export const DEFAULT_USER_SETTINGS = {
  enable_email_notifications: true,
  enable_in_app_notifications: true,
  enable_all_notifications: true,
  preferences: {} as UserSettingsPreferences,
};

/**
 * Extended update input with user_id for audit/RLS purposes.
 */
export interface OrganizationSettingsUpdateContext extends OrganizationSettingsUpdateInput {
  updated_by_user_id: string; // For audit + RLS validation
}
