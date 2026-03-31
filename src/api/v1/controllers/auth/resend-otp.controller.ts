import { canResendVerificationCode, sendVerificationCode } from '../../../../services/auth';
import { validateResendOtp } from '../../validators/auth';

interface AuthenticatedUser {
  id: string;
  auth_id?: string;
  first_name?: string;
  is_active?: boolean;
}

interface ResendOtpBody {
  authUserId?: string;
  firstName?: string;
}

interface Request {
  body?: ResendOtpBody & Record<string, unknown>;
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

export async function resendOtpController(req: Request, res: Response): Promise<void> {
  try {
    const validation = validateResendOtp(req.body ?? {});
    if (validation.error) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid resend OTP payload.',
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
        message: 'authUserId is required to resend OTP.',
      });
      return;
    }

    const eligibility = await canResendVerificationCode(validation.data.email, authUserId);
    if (!eligibility.canResend) {
      sendError(res, 429, {
        code: 'RESEND_RATE_LIMITED',
        message: eligibility.message,
        details: { nextAvailableAt: eligibility.nextAvailableAt },
      });
      return;
    }

    const firstName = validation.data.firstName ?? req.user?.first_name ?? 'User';
    const result = await sendVerificationCode({
      email: validation.data.email,
      authUserId,
      firstName,
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    const authError = error as Partial<ApiError>;
    sendError(res, 500, {
      code: authError.code ?? 'RESEND_OTP_ERROR',
      message: authError.message ?? 'Failed to resend verification code.',
      details: authError.details,
    });
  }
}