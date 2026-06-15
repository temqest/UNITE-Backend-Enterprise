import { supabaseServer } from '../../../../lib/supabase/supabase.client';
import { UserService } from '../../../../services/users/user.service';
import { notificationService } from '../../../../services/notifications/notification.service';
import { validateSignup } from '../../validators/users';

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

const userService = new UserService(supabaseServer, notificationService);

function sendError(res: Response, statusCode: number, error: ApiError): void {
  res.status(statusCode).json({ success: false, error });
}

function hasPermission(user: AuthenticatedUser, permission: string): boolean {
  const roleType = user.role?.type ?? '';
  const permissions = user.role?.permissions ?? [];
  return roleType === 'super_admin' || permissions.includes('*') || permissions.includes(permission);
}

function isAdminLike(user: AuthenticatedUser): boolean {
  const roleType = user.role?.type ?? '';
  return roleType === 'admin' || roleType === 'super_admin';
}

export async function signupAdminController(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body ?? {};
    const baseValidation = validateSignup(body);
    if (!baseValidation.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid admin signup payload.',
        details: baseValidation.error,
      });
      return;
    }

    const signupData = baseValidation.data;
    if (!signupData) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid admin signup payload.',
      });
      return;
    }

    const organization = body.organization as Record<string, unknown> | undefined;
    if (!organization?.name || !organization?.code) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'organization.name and organization.code are required.',
      });
      return;
    }

    const result = await userService.adminSignup({
      organization: {
        name: String(organization.name),
        code: String(organization.code),
        contact_email: typeof organization.contact_email === 'string' ? organization.contact_email : undefined,
        contact_phone: typeof organization.contact_phone === 'string' ? organization.contact_phone : undefined,
        metadata:
          organization.metadata && typeof organization.metadata === 'object' ? (organization.metadata as Record<string, unknown>) : undefined,
      },
      admin: {
        email: signupData.email,
        password: signupData.password,
        first_name: signupData.firstName,
        last_name: signupData.lastName,
      },
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'ADMIN_SIGNUP_FAILED',
        message: result.error?.message ?? 'Failed to create admin account.',
        details: result.error?.details,
      });
      return;
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    const err = error as Partial<ApiError>;
    sendError(res, 500, {
      code: err.code ?? 'ADMIN_SIGNUP_ERROR',
      message: err.message ?? 'Unexpected error during admin signup.',
      details: err.details,
    });
  }
}

export async function signupStaffController(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body ?? {};
    const baseValidation = validateSignup(body);
    if (!baseValidation.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid staff signup payload.',
        details: baseValidation.error,
      });
      return;
    }

    const signupData = baseValidation.data;
    if (!signupData) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid staff signup payload.',
      });
      return;
    }

    const orgCodeRaw = body.org_code ?? body.organizationCode ?? body.invitation_code;
    if (typeof orgCodeRaw !== 'string' || orgCodeRaw.trim().length === 0) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'org_code (or organizationCode/invitation_code) is required for staff signup.',
      });
      return;
    }

    const result = await userService.staffSelfSignup({
      org_code: orgCodeRaw,
      email: signupData.email,
      password: signupData.password,
      first_name: signupData.firstName,
      last_name: signupData.lastName,
      geographic_area:
        body.geographic_area && typeof body.geographic_area === 'object'
          ? (body.geographic_area as Record<string, unknown>)
          : undefined,
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'STAFF_SIGNUP_FAILED',
        message: result.error?.message ?? 'Failed to create staff account.',
        details: result.error?.details,
      });
      return;
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    const err = error as Partial<ApiError>;
    sendError(res, 500, {
      code: err.code ?? 'STAFF_SIGNUP_ERROR',
      message: err.message ?? 'Unexpected error during staff signup.',
      details: err.details,
    });
  }
}

export async function signupDonorController(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body ?? {};
    const baseValidation = validateSignup(body);
    if (!baseValidation.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid donor signup payload.',
        details: baseValidation.error,
      });
      return;
    }

    const signupData = baseValidation.data;
    if (!signupData) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid donor signup payload.',
      });
      return;
    }

    const result = await userService.donorSelfSignup({
      email: signupData.email,
      password: signupData.password,
      first_name: signupData.firstName,
      last_name: signupData.lastName,
      geographic_area:
        body.geographic_area && typeof body.geographic_area === 'object'
          ? (body.geographic_area as Record<string, unknown>)
          : undefined,
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'DONOR_SIGNUP_FAILED',
        message: result.error?.message ?? 'Failed to create donor account.',
        details: result.error?.details,
      });
      return;
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    const err = error as Partial<ApiError>;
    sendError(res, 500, {
      code: err.code ?? 'DONOR_SIGNUP_ERROR',
      message: err.message ?? 'Unexpected error during donor signup.',
      details: err.details,
    });
  }
}

export async function createStaffController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    if (!isAdminLike(req.user) && !hasPermission(req.user, 'manage_users')) {
      sendError(res, 403, {
        code: 'FORBIDDEN',
        message: 'You do not have permission to create staff users.',
      });
      return;
    }

    const body = req.body ?? {};
    const baseValidation = validateSignup(body);
    if (!baseValidation.success) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid create staff payload.',
        details: baseValidation.error,
      });
      return;
    }

    const signupData = baseValidation.data;
    if (!signupData) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid create staff payload.',
      });
      return;
    }

    const roleType = typeof body.roleType === 'string' ? body.roleType : 'staff';
    const permissions = Array.isArray(body.permissions)
      ? body.permissions.filter((item): item is string => typeof item === 'string')
      : [];

    const result = await userService.adminCreateStaff({
      requester_auth_id: req.user.auth_id ?? req.user.id,
      org_id: req.user.org_id ?? String(body.org_id ?? ''),
      email: signupData.email,
      first_name: signupData.firstName,
      last_name: signupData.lastName,
      role: {
        type: roleType,
        permissions,
      },
      send_invite_email: body.send_invite_email === true,
      temporary_password:
        typeof body.temporary_password === 'string' ? body.temporary_password : undefined,
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'CREATE_STAFF_FAILED',
        message: result.error?.message ?? 'Failed to create staff user.',
        details: result.error?.details,
      });
      return;
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    const err = error as Partial<ApiError>;
    sendError(res, 500, {
      code: err.code ?? 'CREATE_STAFF_ERROR',
      message: err.message ?? 'Unexpected error while creating staff user.',
      details: err.details,
    });
  }
}
