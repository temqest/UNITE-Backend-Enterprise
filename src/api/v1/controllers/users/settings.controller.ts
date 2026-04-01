import { z } from 'zod';
import { supabaseServer } from '../../../../lib/supabase/supabase.client';
import { OrganizationSettingsService } from '../../../../services/settings/organization-settings.service';
import { UserSettingsService } from '../../../../services/settings/user-settings.service';
import { validateSettingsUpdate } from '../../validators/users';

interface UserRole {
  type?: string;
  permissions?: string[];
}

interface AuthenticatedUser {
  id: string;
  org_id?: string;
  is_active?: boolean;
  role?: UserRole;
}

interface Request {
  params?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  user?: AuthenticatedUser;
}

interface Response {
  status: (code: number) => Response;
  json: (body: unknown) => void;
}

interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

const orgSettingsService = new OrganizationSettingsService(supabaseServer);
const userSettingsService = new UserSettingsService(supabaseServer);

const orgSettingsUpdateValidator = {
  validate: (payload: unknown) =>
    z
      .object({
        max_blood_bags_per_day: z.number().int().positive().optional(),
        max_events_per_day: z.number().int().positive().optional(),
        event_request_advance_days: z.number().int().nonnegative().optional(),
        prevent_double_booking_same_day: z.boolean().optional(),
        allow_weekend_events: z.boolean().optional(),
        banned_days_of_week: z.array(z.number().int().min(0).max(6)).optional(),
        banned_specific_dates: z.array(z.string()).optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      })
      .safeParse(payload),
};

function sendError(res: Response, statusCode: number, error: ApiError): void {
  res.status(statusCode).json({ success: false, error });
}

function hasPermission(user: AuthenticatedUser, permission: string): boolean {
  const roleType = user.role?.type ?? '';
  const permissions = user.role?.permissions ?? [];

  return (
    roleType === 'super_admin' ||
    permissions.includes('*') ||
    permissions.includes(permission)
  );
}

function canReadOrgSettings(user: AuthenticatedUser): boolean {
  const roleType = user.role?.type ?? '';

  return (
    roleType === 'super_admin' ||
    roleType === 'admin' ||
    hasPermission(user, 'settings.read') ||
    hasPermission(user, 'settings.update') ||
    hasPermission(user, 'manage_org_settings')
  );
}

function canManageOrgSettings(user: AuthenticatedUser): boolean {
  const roleType = user.role?.type ?? '';

  return (
    roleType === 'super_admin' ||
    roleType === 'admin' ||
    hasPermission(user, 'settings.update') ||
    hasPermission(user, 'manage_org_settings')
  );
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asDigestFrequency(value: unknown): 'daily' | 'weekly' | 'monthly' | 'never' | undefined {
  if (value !== 'daily' && value !== 'weekly' && value !== 'monthly' && value !== 'never') {
    return undefined;
  }

  return value;
}

function buildUserSettingsPatch(payload: Record<string, unknown>): {
  enable_email_notifications?: boolean;
  enable_in_app_notifications?: boolean;
  enable_all_notifications?: boolean;
  preferences?: Record<string, unknown>;
} {
  const enableEmail = false;
  const enableInApp = asBoolean(payload.enableInApp) ?? asBoolean(payload.enable_in_app_notifications);
  const enableAll = asBoolean(payload.enableAll) ?? asBoolean(payload.enable_all_notifications);
  const enableSms = asBoolean(payload.enableSms) ?? asBoolean(payload.enable_sms_notifications);
  const enablePush = asBoolean(payload.enablePushNotifications) ?? asBoolean(payload.enable_push_notifications);
  const enableEventNotifications = asBoolean(payload.enableEventNotifications) ?? asBoolean(payload.enable_event_notifications);
  const enableOrgUpdates = asBoolean(payload.enableOrgUpdates) ?? asBoolean(payload.enable_org_updates);
  const emailDigestFrequency =
    asDigestFrequency(payload.emailDigestFrequency) ?? asDigestFrequency(payload.email_digest_frequency);
  const timezone = asString(payload.timezone);
  const language = asString(payload.language);

  const preferences: Record<string, unknown> = {
    enableSms,
    enablePushNotifications: enablePush,
    enableEventNotifications,
    enableOrgUpdates,
    emailDigestFrequency,
    timezone,
    language,
  };

  const hasAnyPreference = Object.values(preferences).some((value) => value !== undefined);

  const computedEnableAll =
    enableAll ??
    (enableInApp !== undefined
      ? Boolean(enableInApp)
      : undefined);

  return {
    enable_email_notifications: enableEmail,
    enable_in_app_notifications: enableInApp,
    enable_all_notifications: computedEnableAll,
    preferences: hasAnyPreference ? preferences : undefined,
  };
}

export async function getOrganizationSettingsController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated organization user required.',
      });
      return;
    }

    if (!canReadOrgSettings(req.user)) {
      sendError(res, 403, {
        code: 'FORBIDDEN',
        message: 'You do not have permission to view organization settings.',
      });
      return;
    }

    const result = await orgSettingsService.getSettings(req.user.org_id);
    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'ORG_SETTINGS_FETCH_FAILED',
        message: result.error?.message ?? 'Failed to fetch organization settings.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'ORG_SETTINGS_FETCH_ERROR',
      message: 'Unexpected error while fetching organization settings.',
      details: error,
    });
  }
}

export async function updateOrganizationSettingsController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated organization user required.',
      });
      return;
    }

    if (!canManageOrgSettings(req.user)) {
      sendError(res, 403, {
        code: 'FORBIDDEN',
        message: 'You do not have permission to update organization settings.',
      });
      return;
    }

    const parsed = orgSettingsUpdateValidator.validate(req.body ?? {});
    if (!parsed.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid organization settings payload.',
        details: parsed.error.issues,
      });
      return;
    }

    const result = await orgSettingsService.updateSettings(
      req.user.org_id,
      parsed.data,
      req.user.id
    );

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'ORG_SETTINGS_UPDATE_FAILED',
        message: result.error?.message ?? 'Failed to update organization settings.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'ORG_SETTINGS_UPDATE_ERROR',
      message: 'Unexpected error while updating organization settings.',
      details: error,
    });
  }
}

export async function getUserSettingsController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated organization user required.',
      });
      return;
    }

    const targetUserId = req.params?.userId ?? req.user.id;
    if (targetUserId !== req.user.id && !canManageOrgSettings(req.user)) {
      sendError(res, 403, {
        code: 'FORBIDDEN',
        message: 'You do not have permission to access settings for this user.',
      });
      return;
    }

    const result = await userSettingsService.getSettingsByOrgAndUser(req.user.org_id, targetUserId);
    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'USER_SETTINGS_FETCH_FAILED',
        message: result.error?.message ?? 'Failed to fetch user settings.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'USER_SETTINGS_FETCH_ERROR',
      message: 'Unexpected error while fetching user settings.',
      details: error,
    });
  }
}

export async function updateUserSettingsController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    const validation = validateSettingsUpdate(req.body ?? {});
    if (!validation.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid user settings payload.',
        details: validation.error,
      });
      return;
    }

    const settingsData = validation.data;
    if (!settingsData) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid user settings payload.',
      });
      return;
    }

    const targetUserId = req.params?.userId ?? req.user.id;
    if (targetUserId !== req.user.id && !canManageOrgSettings(req.user)) {
      sendError(res, 403, {
        code: 'FORBIDDEN',
        message: 'You do not have permission to update settings for this user.',
      });
      return;
    }

    const patch = buildUserSettingsPatch(settingsData as unknown as Record<string, unknown>);

    const result = await userSettingsService.updateSettings(targetUserId, patch);
    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'USER_SETTINGS_UPDATE_FAILED',
        message: result.error?.message ?? 'Failed to update user settings.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'USER_SETTINGS_UPDATE_ERROR',
      message: 'Unexpected error while updating user settings.',
      details: error,
    });
  }
}