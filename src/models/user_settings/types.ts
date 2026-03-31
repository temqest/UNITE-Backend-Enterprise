// user_settings/types.ts
export interface UserSettingsPreferences {
  [key: string]: unknown;
}

export interface UserSettingsRow {
  id: string;
  org_id: string;
  user_id: string;
  enable_email_notifications: boolean;
  enable_in_app_notifications: boolean;
  enable_all_notifications: boolean;
  preferences: UserSettingsPreferences;
  created_at: string;
  updated_at: string;
}

export interface UserSettingsCreateInput {
  org_id: string;
  user_id: string;
  enable_email_notifications?: boolean;
  enable_in_app_notifications?: boolean;
  enable_all_notifications?: boolean;
  preferences?: UserSettingsPreferences;
}

export interface UserSettingsUpdateInput {
  enable_email_notifications?: boolean;
  enable_in_app_notifications?: boolean;
  enable_all_notifications?: boolean;
  preferences?: UserSettingsPreferences;
}
