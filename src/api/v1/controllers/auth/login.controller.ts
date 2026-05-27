import type { Request, Response } from 'express';
import { loginWithEmailPassword } from '../../../../services/auth';
import {
  getRequestSessionMetadata,
  setRefreshCookie,
  stripRefreshToken,
  tryCreateAppRefreshSession,
} from '../../../../services/auth/http-session.service';
import { validateLogin } from '../../validators/auth';

interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

function sendError(res: Response, statusCode: number, error: ApiError): void {
  res.status(statusCode).json({ success: false, error });
}

export async function loginController(req: Request, res: Response): Promise<void> {
  try {
    const validation = validateLogin(req.body ?? {});
    if (validation.error) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid login payload.',
        details: validation.error.issues,
      });
      return;
    }

    const result = await loginWithEmailPassword(validation.data);
    let refreshWarning: { code: string; message: string } | undefined;

    if (result.refreshToken) {
      const persistence = await tryCreateAppRefreshSession(
        result.user,
        result.refreshToken,
        result.accessToken,
        getRequestSessionMetadata(req)
      );

      if (persistence.ok) {
        setRefreshCookie(res, result.refreshToken);
      } else {
        refreshWarning = persistence.warning;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        ...stripRefreshToken(result),
        ...(refreshWarning ? { refreshWarning } : {}),
      },
    });
  } catch (error) {
    const authError = error as Partial<ApiError>;
    sendError(res, 401, {
      code: authError.code ?? 'LOGIN_FAILED',
      message: authError.message ?? 'Failed to login.',
      details: authError.details,
    });
  }
}
