// organization_settings/types.ts
export interface OrganizationSettingsConfig {
  [key: string]: unknown;
}

export interface OrganizationSettingsRow {
  id: string;
  org_id: string;
  max_blood_bags_per_day: number;
  max_events_per_day: number;
  event_request_advance_days: number;
  prevent_double_booking_same_day: boolean;
  allow_weekend_events: boolean;
  banned_days_of_week: number[];
  banned_specific_dates: string[];
  config: OrganizationSettingsConfig;
  created_at: string;
  updated_at: string;
}

export interface OrganizationSettingsCreateInput {
  org_id: string;
  max_blood_bags_per_day?: number;
  max_events_per_day?: number;
  event_request_advance_days?: number;
  prevent_double_booking_same_day?: boolean;
  allow_weekend_events?: boolean;
  banned_days_of_week?: number[];
  banned_specific_dates?: string[];
  config?: OrganizationSettingsConfig;
}

export interface OrganizationSettingsUpdateInput {
  max_blood_bags_per_day?: number;
  max_events_per_day?: number;
  event_request_advance_days?: number;
  prevent_double_booking_same_day?: boolean;
  allow_weekend_events?: boolean;
  banned_days_of_week?: number[];
  banned_specific_dates?: string[];
  config?: OrganizationSettingsConfig;
}
