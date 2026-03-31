import { supabaseServer } from '../../../../lib/supabase/supabase.client';
import {
  validateGetProfile,
  validateProfileUpdate,
} from '../../validators/users';

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
  query?: Record<string, unknown>;
  body?: unknown;
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

function sendError(res: Response, statusCode: number, error: ApiError): void {
  res.status(statusCode).json({ success: false, error });
}

function isAdminLike(user: AuthenticatedUser): boolean {
  const roleType = user.role?.type ?? '';
  return roleType === 'admin' || roleType === 'super_admin';
}

export async function getProfileController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    const userIdFromRequest =
      req.params?.userId ??
      (typeof req.query?.userId === 'string' ? req.query.userId : undefined);

    const validation = validateGetProfile({ userId: userIdFromRequest });
    if (!validation.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid profile request.',
        details: validation.error,
      });
      return;
    }

    const getProfileData = validation.data;
    if (!getProfileData) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid profile request.',
      });
      return;
    }

    const targetUserId = getProfileData.userId ?? req.user.id;
    if (targetUserId !== req.user.id && !isAdminLike(req.user)) {
      sendError(res, 403, {
        code: 'FORBIDDEN',
        message: 'You can only access your own profile.',
      });
      return;
    }

    let query = supabaseServer.from('users').select('*').eq('id', targetUserId);
    if (req.user.org_id) {
      query = query.eq('org_id', req.user.org_id);
    }

    const { data, error } = await query.single();
    if (error || !data) {
      sendError(res, 404, {
        code: 'PROFILE_NOT_FOUND',
        message: 'Profile not found.',
        details: error,
      });
      return;
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, 500, {
      code: 'GET_PROFILE_ERROR',
      message: 'Unexpected error while fetching profile.',
      details: error,
    });
  }
}

export async function updateProfileController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    const validation = validateProfileUpdate(req.body ?? {});
    if (!validation.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid profile update payload.',
        details: validation.error,
      });
      return;
    }

    const updateData = validation.data;
    if (!updateData) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid profile update payload.',
      });
      return;
    }

    const targetUserId = req.params?.userId ?? req.user.id;
    if (targetUserId !== req.user.id && !isAdminLike(req.user)) {
      sendError(res, 403, {
        code: 'FORBIDDEN',
        message: 'You can only update your own profile.',
      });
      return;
    }

    const patch: Record<string, unknown> = {};
    if (updateData.firstName !== undefined) {
      patch.first_name = updateData.firstName;
    }
    if (updateData.lastName !== undefined) {
      patch.last_name = updateData.lastName;
    }
    if (updateData.geographicArea !== undefined) {
      patch.geographic_area =
        updateData.geographicArea === null ? null : { city: updateData.geographicArea };
    }
    if (updateData.role !== undefined) {
      if (!isAdminLike(req.user)) {
        sendError(res, 403, {
          code: 'FORBIDDEN',
          message: 'Only admins can update user roles.',
        });
        return;
      }
      patch.role = {
        type: updateData.role,
        permissions: updateData.role === 'admin' ? ['*'] : [],
      };
    }

    const usersTable = supabaseServer.from('users') as any;
    let query = usersTable.update(patch).eq('id', targetUserId);
    if (req.user.org_id) {
      query = query.eq('org_id', req.user.org_id);
    }

    const { data, error } = await query.select('*').single();
    if (error || !data) {
      sendError(res, 400, {
        code: 'PROFILE_UPDATE_FAILED',
        message: 'Failed to update profile.',
        details: error,
      });
      return;
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, 500, {
      code: 'UPDATE_PROFILE_ERROR',
      message: 'Unexpected error while updating profile.',
      details: error,
    });
  }
}
