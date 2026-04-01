import { supabaseServer } from '../../../../lib/supabase/supabase.client';
import { UserService } from '../../../../services/users/user.service';
import { notificationService } from '../../../../services/notifications/notification.service';
import { validateStaffApproval } from '../../validators/users';

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

const userService = new UserService(supabaseServer, notificationService);

function sendError(res: Response, statusCode: number, error: ApiError): void {
  res.status(statusCode).json({ success: false, error });
}

function canApproveStaff(user: AuthenticatedUser): boolean {
  const roleType = user.role?.type ?? '';
  const permissions = user.role?.permissions ?? [];
  return roleType === 'super_admin' || permissions.includes('*') || permissions.includes('approve_staff');
}

export async function approveStaffController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    if (!canApproveStaff(req.user)) {
      sendError(res, 403, {
        code: 'FORBIDDEN',
        message: 'You do not have permission to approve staff.',
      });
      return;
    }

    const validation = validateStaffApproval(req.body ?? {});
    if (!validation.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid staff approval payload.',
        details: validation.error,
      });
      return;
    }

    const approvalData = validation.data;
    if (!approvalData) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid staff approval payload.',
      });
      return;
    }

    if (approvalData.status === 'approve') {
      const result = await userService.approvePendingUser({
        requester_auth_id: req.user.auth_id ?? req.user.id,
        user_id: approvalData.userId,
        role_type: typeof approvalData.roleType === 'string' ? approvalData.roleType : undefined,
        sector: typeof approvalData.sector === 'string' ? approvalData.sector : undefined,
      });

      if (result.error || !result.data) {
        sendError(res, 400, {
          code: result.error?.code ?? 'STAFF_APPROVAL_FAILED',
          message: result.error?.message ?? 'Failed to approve staff user.',
          details: result.error?.details,
        });
        return;
      }

      res.status(200).json({ success: true, data: result.data });
      return;
    }

    const { data: targetUserRaw, error: targetError } = await supabaseServer
      .from('users')
      .select('id, auth_id, is_active, org_id')
      .eq('id', approvalData.userId)
      .eq('org_id', req.user.org_id ?? '')
      .maybeSingle();

    const targetUser = targetUserRaw as {
      id: string;
      auth_id?: string | null;
      is_active?: boolean | null;
      org_id?: string | null;
    } | null;

    if (targetError || !targetUser) {
      sendError(res, 400, {
        code: 'STAFF_REJECTION_FAILED',
        message: 'Failed to reject staff user.',
        details: targetError,
      });
      return;
    }

    if (targetUser.is_active) {
      sendError(res, 400, {
        code: 'INVALID_REJECTION_TARGET',
        message: 'Only pending signup accounts can be rejected from this flow.',
      });
      return;
    }

    const authId = typeof targetUser.auth_id === 'string' ? targetUser.auth_id : '';
    if (authId) {
      const authDelete = await supabaseServer.auth.admin.deleteUser(authId);
      if (authDelete.error) {
        sendError(res, 400, {
          code: 'STAFF_REJECTION_FAILED',
          message: 'Failed to reject staff user.',
          details: authDelete.error,
        });
        return;
      }
    } else {
      await supabaseServer.from('users').delete().eq('id', approvalData.userId);
    }

    res.status(200).json({
      success: true,
      data: {
        userId: approvalData.userId,
        status: 'rejected',
      },
    });
  } catch (error) {
    sendError(res, 500, {
      code: 'STAFF_APPROVAL_ERROR',
      message: 'Unexpected error while processing staff approval action.',
      details: error,
    });
  }
}
