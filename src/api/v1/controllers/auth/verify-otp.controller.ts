import { verifySignupOtp } from '../../../../services/auth';
import { validateVerifyOtp } from '../../validators/auth';

interface AuthenticatedUser {
  id: string;
  auth_id?: string;
  is_active?: boolean;
}

interface VerifyOtpBody {
  authUserId?: string;
}

interface Request {
  body?: VerifyOtpBody & Record<string, unknown>;
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

export async function verifyOtpController(req: Request, res: Response): Promise<void> {
  try {
    const validation = validateVerifyOtp(req.body ?? {});
    if (validation.error) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid OTP verification payload.',
        details: validation.error.issues,
      });
      return;
    }

    if (req.user && validation.data.authUserId && validation.data.authUserId !== (req.user.auth_id ?? req.user.id)) {
      sendError(res, 403, {
        code: 'AUTH_USER_ID_MISMATCH',
        message: 'authUserId does not match the authenticated user.',
      });
      return;
    }

    const authUserId = req.user?.auth_id ?? req.user?.id ?? validation.data.authUserId;
    if (!authUserId) {
      sendError(res, 400, {
        code: 'AUTH_USER_ID_REQUIRED',
        message: 'authUserId is required for OTP verification.',
      });
      return;
    }

    const result = await verifySignupOtp({
      email: validation.data.email,
      code: validation.data.code,
      authUserId,
    });

    if (!result.success) {
      sendError(res, 400, {
        code: 'OTP_VERIFICATION_FAILED',
        message: result.message,
        details: { remainingAttempts: result.remainingAttempts },
      });
      return;
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    const authError = error as Partial<ApiError>;
    sendError(res, 500, {
      code: authError.code ?? 'OTP_VERIFICATION_ERROR',
      message: authError.message ?? 'Failed to verify OTP.',
      details: authError.details,
    });
  }
}
