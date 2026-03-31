import { supabaseServer } from '../../../../lib/supabase/supabase.client';
import { validateChangePassword, validateForgotPassword } from '../../validators/auth';

interface AuthenticatedUser {
  id: string;
  auth_id?: string;
  is_active?: boolean;
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

function sendError(res: Response, statusCode: number, error: ApiError): void {
  res.status(statusCode).json({ success: false, error });
}

export async function forgotPasswordController(req: Request, res: Response): Promise<void> {
  try {
    const validation = validateForgotPassword(req.body ?? {});
    if (validation.error) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid forgot password payload.',
        details: validation.error.issues,
      });
      return;
    }

    const appUrl = process.env.FRONTEND_BASE_URL || process.env.APP_URL;

    await supabaseServer.auth.resetPasswordForEmail(validation.data.email, {
      redirectTo: appUrl ? `${appUrl.replace(/\/$/, '')}/login` : undefined,
    });

    // Return a generic success response to avoid exposing account existence.
    res.status(200).json({
      success: true,
      data: {
        message: 'If the email exists, a password reset link has been sent.',
      },
    });
  } catch (error) {
    sendError(res, 500, {
      code: 'FORGOT_PASSWORD_FAILED',
      message: 'Failed to process forgot password request.',
      details: error,
    });
  }
}

export async function changePasswordController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id || req.user.is_active === false) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    const validation = validateChangePassword(req.body ?? {});
    if (validation.error) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid change password payload.',
        details: validation.error.issues,
      });
      return;
    }

    const authUserId = req.user.auth_id ?? req.user.id;
    const updateResult = await supabaseServer.auth.admin.updateUserById(authUserId, {
      password: validation.data.newPassword,
      user_metadata: {
        force_password_change: false,
      },
    });

    if (updateResult.error) {
      sendError(res, 400, {
        code: 'CHANGE_PASSWORD_FAILED',
        message: 'Failed to update password.',
        details: updateResult.error,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        message: 'Password updated successfully.',
      },
    });
  } catch (error) {
    sendError(res, 500, {
      code: 'CHANGE_PASSWORD_ERROR',
      message: 'Unexpected error while changing password.',
      details: error,
    });
  }
}
