import { supabaseServer } from '../../../../lib/supabase/supabase.client';
import { UserService } from '../../../../services/users/user.service';
import { notificationService } from '../../../../services/notifications/notification.service';
import { resolveCanonicalRole, ROLE_DEFAULT_PERMISSIONS } from '../../../../services/auth/rbac.constants';

interface UserRole {
  type?: string;
  permissions?: string[];
}

interface AuthenticatedUser {
  id: string;
  auth_id?: string;
  org_id?: string;
  is_active?: boolean;
  role?: UserRole;
}

interface Request {
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
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

interface UserRowLike {
  id: string;
  auth_id?: string;
  org_id: string;
  role?: { type?: string; permissions?: string[] } | string | null;
  geographic_area?: Record<string, unknown> | null;
  [key: string]: unknown;
}

const userService = new UserService(supabaseServer, notificationService);

function sendError(res: Response, statusCode: number, error: ApiError): void {
  res.status(statusCode).json({ success: false, error });
}

function isAdminLike(user: AuthenticatedUser): boolean {
  const roleType = user.role?.type ?? '';
  return roleType === 'admin' || roleType === 'super_admin';
}

function hasManageUsersPermission(user: AuthenticatedUser): boolean {
  const permissions = user.role?.permissions ?? [];
  return permissions.includes('*') || permissions.includes('users.invite') || permissions.includes('manage_staff');
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildRoleFromInput(roleTypeRaw: string): { type: string; permissions: string[] } {
  const roleType = roleTypeRaw.trim();
  const canonical = resolveCanonicalRole(roleType);
  const defaultPermissions = ROLE_DEFAULT_PERMISSIONS[canonical] ?? [];

  if (roleType === canonical || roleType === 'super_admin') {
    return {
      type: roleType,
      permissions: [...defaultPermissions],
    };
  }

  return {
    type: roleType,
    permissions: [],
  };
}

function toGeographicAreaObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
}

function hasOwnKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0;
}

function shapeStaffResponse(user: UserRowLike): Record<string, unknown> {
  const geographic = toGeographicAreaObject(user.geographic_area);
  const resolvedRole =
    typeof user.role === 'string'
      ? user.role
      : typeof user.role === 'object' && user.role
        ? String((user.role as { type?: string }).type ?? '')
        : '';

  return {
    ...user,
    role: resolvedRole || null,
    status: user.is_active === true ? 'active' : 'pending',
    sector: geographic.sector ?? null,
    province: geographic.province ?? null,
    district: geographic.district ?? null,
    municipality: geographic.municipality ?? null,
  };
}

export async function listStaffController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user with organization scope required.',
      });
      return;
    }

    const roleFilter = normalizeOptionalText(req.query?.role);
    const search = normalizeOptionalText(req.query?.search);

    let query = supabaseServer
      .from('users')
      .select('*')
      .eq('org_id', req.user.org_id)
      .neq('id', req.user.id)
      .order('created_at', { ascending: false });

    if (roleFilter) {
      query = query.eq('role->>type', roleFilter);
    }

    if (search) {
      const escaped = search.replace(/[%_]/g, '\\$&');
      query = query.or(`first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,email.ilike.%${escaped}%`);
    }

    const { data, error } = await query;
    if (error) {
      sendError(res, 400, {
        code: 'STAFF_LIST_FAILED',
        message: 'Failed to list staff users.',
        details: error,
      });
      return;
    }

    const users = Array.isArray(data) ? data.map((user) => shapeStaffResponse(user as UserRowLike)) : [];
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    sendError(res, 500, {
      code: 'STAFF_LIST_ERROR',
      message: 'Unexpected error while listing staff users.',
      details: error,
    });
  }
}

export async function createStaffManagementController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user with organization scope required.',
      });
      return;
    }

    if (!isAdminLike(req.user) && !hasManageUsersPermission(req.user)) {
      sendError(res, 403, {
        code: 'FORBIDDEN',
        message: 'You do not have permission to create staff users.',
      });
      return;
    }

    const body = req.body ?? {};
    const options = Array.isArray(body.options)
      ? body.options.filter((item): item is string => typeof item === 'string')
      : [];
    const shouldSpecifyLocation = options.includes('specify_location');

    const geographicArea: Record<string, unknown> = {
      sector: normalizeOptionalText(body.sector) ?? 'none',
      options,
    };

    if (shouldSpecifyLocation) {
      geographicArea.province = normalizeOptionalText(body.province) ?? null;
      geographicArea.district = normalizeOptionalText(body.district) ?? null;
      geographicArea.municipality = normalizeOptionalText(body.municipality) ?? null;
    }

    const roleType = normalizeOptionalText(body.role);
    if (!roleType) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Role is required.',
      });
      return;
    }

    const result = await userService.adminCreateStaff({
      requester_auth_id: req.user.auth_id ?? req.user.id,
      org_id: req.user.org_id,
      email: String(body.email ?? ''),
      first_name: String(body.first_name ?? ''),
      last_name: String(body.last_name ?? ''),
      role: buildRoleFromInput(roleType),
      geographic_area: hasOwnKeys(geographicArea) ? geographicArea : null,
      send_invite_email: false,
      temporary_password: String(body.password ?? ''),
    });

    if (result.error || !result.data?.user) {
      sendError(res, 400, {
        code: result.error?.code ?? 'CREATE_STAFF_FAILED',
        message: result.error?.message ?? 'Failed to create staff user.',
        details: result.error?.details,
      });
      return;
    }

    if (body.force_password_change === true && result.data.auth_user_id) {
      await supabaseServer.auth.admin.updateUserById(result.data.auth_user_id, {
        user_metadata: {
          force_password_change: true,
        },
      });
    }

    res.status(201).json({ success: true, data: shapeStaffResponse(result.data.user as unknown as UserRowLike) });
  } catch (error) {
    sendError(res, 500, {
      code: 'CREATE_STAFF_ERROR',
      message: 'Unexpected error while creating staff user.',
      details: error,
    });
  }
}

export async function updateStaffManagementController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user with organization scope required.',
      });
      return;
    }

    const targetUserId = req.params?.id;
    if (!targetUserId) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'User id is required.',
      });
      return;
    }

    const existingQuery = supabaseServer.from('users').select('*').eq('id', targetUserId).eq('org_id', req.user.org_id).maybeSingle();
    const { data: existingUserRaw, error: existingError } = await existingQuery;
    const existingUser = existingUserRaw as UserRowLike | null;
    if (existingError || !existingUser) {
      sendError(res, 404, {
        code: 'USER_NOT_FOUND',
        message: 'Staff user not found.',
        details: existingError,
      });
      return;
    }

    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};

    const firstName = normalizeOptionalText(body.first_name);
    if (firstName !== undefined) {
      patch.first_name = firstName;
    }

    const lastName = normalizeOptionalText(body.last_name);
    if (lastName !== undefined) {
      patch.last_name = lastName;
    }

    const incomingEmail = normalizeOptionalText(body.email);
    if (incomingEmail !== undefined && incomingEmail.toLowerCase() !== String(existingUser.email).toLowerCase()) {
      const authId = String(existingUser.auth_id ?? '');
      if (!authId) {
        sendError(res, 400, {
          code: 'USER_UPDATE_FAILED',
          message: 'Target user is missing auth_id and cannot update email.',
        });
        return;
      }

      const authResult = await supabaseServer.auth.admin.updateUserById(authId, {
        email: incomingEmail.toLowerCase(),
      });

      if (authResult.error) {
        sendError(res, 400, {
          code: 'AUTH_EMAIL_UPDATE_FAILED',
          message: 'Failed to update auth email.',
          details: authResult.error,
        });
        return;
      }

      patch.email = incomingEmail.toLowerCase();
    }

    const incomingRole = normalizeOptionalText(body.role);
    if (incomingRole !== undefined) {
      patch.role = buildRoleFromInput(incomingRole);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'phone_number')) {
      patch.phone_number = normalizeOptionalText(body.phone_number) ?? null;
    }

    const geographic = toGeographicAreaObject(existingUser.geographic_area);
    let shouldPatchGeographic = false;

    const incomingSector = normalizeOptionalText(body.sector);
    if (incomingSector !== undefined) {
      geographic.sector = incomingSector;
      shouldPatchGeographic = true;
    }

    const incomingProvince = normalizeOptionalText(body.province);
    if (incomingProvince !== undefined) {
      geographic.province = incomingProvince;
      shouldPatchGeographic = true;
    }

    const incomingDistrict = normalizeOptionalText(body.district);
    if (incomingDistrict !== undefined) {
      geographic.district = incomingDistrict;
      shouldPatchGeographic = true;
    }

    const incomingMunicipality = normalizeOptionalText(body.municipality);
    if (incomingMunicipality !== undefined) {
      geographic.municipality = incomingMunicipality;
      shouldPatchGeographic = true;
    }

    const incomingArea = normalizeOptionalText(body.geographic_area);
    if (incomingArea !== undefined) {
      geographic.city = incomingArea;
      shouldPatchGeographic = true;
    }

    if (shouldPatchGeographic) {
      patch.geographic_area = hasOwnKeys(geographic) ? geographic : null;
    }

    if (Object.keys(patch).length === 0) {
      res.status(200).json({ success: true, data: shapeStaffResponse(existingUser as UserRowLike) });
      return;
    }

    const usersTable = supabaseServer.from('users') as any;
    const { data: updatedRaw, error: updateError } = await usersTable
      .update(patch)
      .eq('id', targetUserId)
      .eq('org_id', req.user.org_id)
      .select('*')
      .single();

    const updated = updatedRaw as UserRowLike | null;

    if (updateError || !updated) {
      sendError(res, 400, {
        code: 'USER_UPDATE_FAILED',
        message: 'Failed to update staff user.',
        details: updateError,
      });
      return;
    }

    res.status(200).json({ success: true, data: shapeStaffResponse(updated as UserRowLike) });
  } catch (error) {
    sendError(res, 500, {
      code: 'USER_UPDATE_ERROR',
      message: 'Unexpected error while updating staff user.',
      details: error,
    });
  }
}

export async function deleteStaffManagementController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user with organization scope required.',
      });
      return;
    }

    const targetUserId = req.params?.id;
    if (!targetUserId) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'User id is required.',
      });
      return;
    }

    if (targetUserId === req.user.id) {
      sendError(res, 400, {
        code: 'INVALID_OPERATION',
        message: 'You cannot delete your own account.',
      });
      return;
    }

    const { data: targetUserRaw, error: targetError } = await supabaseServer
      .from('users')
      .select('id, auth_id, org_id')
      .eq('id', targetUserId)
      .eq('org_id', req.user.org_id)
      .maybeSingle();

    const targetUser = targetUserRaw as { auth_id?: string } | null;

    if (targetError || !targetUser) {
      sendError(res, 404, {
        code: 'USER_NOT_FOUND',
        message: 'Staff user not found.',
        details: targetError,
      });
      return;
    }

    const authId = String(targetUser.auth_id ?? '');
    if (!authId) {
      sendError(res, 400, {
        code: 'USER_DELETE_FAILED',
        message: 'Target user is missing auth_id and cannot be deleted safely.',
      });
      return;
    }

    const authDelete = await supabaseServer.auth.admin.deleteUser(authId);
    if (authDelete.error) {
      sendError(res, 400, {
        code: 'AUTH_DELETE_FAILED',
        message: 'Failed to delete auth user.',
        details: authDelete.error,
      });
      return;
    }

    res.status(200).json({ success: true, data: null });
  } catch (error) {
    sendError(res, 500, {
      code: 'USER_DELETE_ERROR',
      message: 'Unexpected error while deleting staff user.',
      details: error,
    });
  }
}
