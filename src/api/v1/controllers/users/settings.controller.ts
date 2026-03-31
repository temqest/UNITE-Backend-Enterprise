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

function canManageOrgSettings(user: AuthenticatedUser): boolean {
  const roleType = user.role?.type ?? '';
  const permissions = user.role?.permissions ?? [];
  return (
    roleType === 'super_admin' ||
    roleType === 'admin' ||
    permissions.includes('*') ||
    permissions.includes('manage_org_settings')
  );
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

    const patch = {
      enable_email_notifications: settingsData.enableEmail,
      enable_in_app_notifications: settingsData.enableInApp,
      enable_all_notifications:
        settingsData.enableEmail !== undefined || settingsData.enableInApp !== undefined
          ? (settingsData.enableEmail ?? true) || (settingsData.enableInApp ?? true)
          : undefined,
      preferences: {
        enableSms: settingsData.enableSms,
        enablePushNotifications: settingsData.enablePushNotifications,
        enableEventNotifications: settingsData.enableEventNotifications,
        enableOrgUpdates: settingsData.enableOrgUpdates,
        emailDigestFrequency: settingsData.emailDigestFrequency,
        timezone: settingsData.timezone,
        language: settingsData.language,
      },
    };

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