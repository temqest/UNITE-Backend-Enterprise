import type { Request, Response } from 'express';
import {
  clearRefreshCookie,
  revokeRefreshSessionFromRequest,
  revokeSupabaseSessionFromRequest,
} from '../../../../services/auth/http-session.service';

interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

function sendError(res: Response, statusCode: number, error: ApiError): void {
  res.status(statusCode).json({ success: false, error });
}

export async function logoutController(req: Request, res: Response): Promise<void> {
  try {
    await revokeRefreshSessionFromRequest(req, 'logout');
    await revokeSupabaseSessionFromRequest(req);
    clearRefreshCookie(res);
    res.status(200).json({
      success: true,
      data: {
        success: true,
        message: 'Logged out successfully',
      },
    });
  } catch (error) {
    const authError = error as Partial<ApiError>;
    clearRefreshCookie(res);
    sendError(res, 500, {
      code: authError.code ?? 'LOGOUT_FAILED',
      message: authError.message ?? 'Failed to logout.',
      details: authError.details,
    });
  }
}
