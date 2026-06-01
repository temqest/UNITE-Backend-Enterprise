import { type Request, type Response } from 'express';
import { supabaseServer } from '../../../../lib/supabase/supabase.client';
import { uploadProfilePictureService, deleteProfilePictureService, attachSignedProfileUrls } from '../../../../services/users/profile-picture.service';

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

interface CustomRequest extends Request {
  user?: AuthenticatedUser;
  file?: Express.Multer.File;
}

function sendError(res: Response, statusCode: number, error: { code: string; message: string; details?: unknown }): void {
  res.status(statusCode).json({ success: false, error });
}

function isAdminLike(user: AuthenticatedUser): boolean {
  const roleType = user.role?.type ?? '';
  return roleType === 'admin' || roleType === 'super_admin';
}

function hasUsersInvitePermission(user: AuthenticatedUser): boolean {
  if (isAdminLike(user)) return true;
  return user.role?.permissions?.includes('users.invite') ?? false;
}

export async function uploadProfilePictureController(req: CustomRequest, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    const targetUserId = req.params?.id;
    if (!targetUserId) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'User ID is required.',
      });
      return;
    }

    // Fetch target user to check permissions
    const { data: targetUser, error: targetError } = await supabaseServer
      .from('users')
      .select('id, org_id, role')
      .eq('id', targetUserId)
      .single<any>();

    if (targetError || !targetUser) {
      sendError(res, 404, { code: 'USER_NOT_FOUND', message: 'User not found.' });
      return;
    }

    const actorRole = req.user.role?.type ?? '';
    const targetRoleObj = typeof targetUser.role === 'string' ? targetUser.role : targetUser.role?.type;
    const targetRole = String(targetRoleObj ?? '');
    const isSelf = targetUserId === req.user.id;

    let allowed = false;
    if (isSelf) allowed = true;
    else if (actorRole === 'super_admin') allowed = true;
    else if (actorRole === 'admin') allowed = targetRole !== 'admin' && targetRole !== 'super_admin';
    else if (actorRole === 'coordinator') allowed = targetRole === 'stakeholder';

    if (!allowed) {
      sendError(res, 403, {
        code: 'FORBIDDEN',
        message: 'You do not have permission to update this profile.',
      });
      return;
    }

    if (!req.file) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'No file provided.',
      });
      return;
    }

    // Validate mime type (just in case multer didn't catch it or we didn't set fileFilter)
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Only JPG, PNG, or WebP images are allowed.',
      });
      return;
    }

    // Validate size manually just in case
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (req.file.size > maxSize) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Image must be under 5 MB.',
      });
      return;
    }

    const result = await uploadProfilePictureService(
      targetUserId as string,
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    if (!result.success) {
      sendError(res, 400, result.error as any);
      return;
    }

    const finalData = await attachSignedProfileUrls(result.data as any);
    res.status(200).json({ success: true, data: finalData });
  } catch (error) {
    console.error('uploadProfilePictureController error:', error);
    sendError(res, 500, {
      code: 'UPLOAD_ERROR',
      message: 'Unable to upload profile picture. Please try again.',
      details: error,
    });
  }
}

export async function deleteProfilePictureController(req: CustomRequest, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false || !req.user.org_id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    const targetUserId = req.params?.id;
    if (!targetUserId) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'User ID is required.',
      });
      return;
    }

    // Fetch target user to check permissions
    const { data: targetUser, error: targetError } = await supabaseServer
      .from('users')
      .select('id, org_id, role')
      .eq('id', targetUserId)
      .single<any>();

    if (targetError || !targetUser) {
      sendError(res, 404, { code: 'USER_NOT_FOUND', message: 'User not found.' });
      return;
    }

    const actorRole = req.user.role?.type ?? '';
    const targetRoleObj = typeof targetUser.role === 'string' ? targetUser.role : targetUser.role?.type;
    const targetRole = String(targetRoleObj ?? '');
    const isSelf = targetUserId === req.user.id;

    let allowed = false;
    if (isSelf) allowed = true;
    else if (actorRole === 'super_admin') allowed = true;
    else if (actorRole === 'admin') allowed = targetRole !== 'admin' && targetRole !== 'super_admin';
    else if (actorRole === 'coordinator') allowed = targetRole === 'stakeholder';

    if (!allowed) {
      sendError(res, 403, {
        code: 'FORBIDDEN',
        message: 'You do not have permission to update this profile.',
      });
      return;
    }

    const result = await deleteProfilePictureService(targetUserId as string);

    if (!result.success) {
      sendError(res, 400, result.error as any);
      return;
    }

    const finalData = await attachSignedProfileUrls(result.data as any);
    res.status(200).json({ success: true, data: finalData });
  } catch (error) {
    console.error('deleteProfilePictureController error:', error);
    sendError(res, 500, {
      code: 'DELETE_ERROR',
      message: 'Unable to delete profile picture. Please try again.',
      details: error,
    });
  }
}
