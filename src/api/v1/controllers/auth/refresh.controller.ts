import type { Request, Response } from 'express';
import {
  clearRefreshCookie,
  refreshAppSessionFromRequest,
  setRefreshCookie,
} from '../../../../services/auth/http-session.service';

interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

function sendError(res: Response, statusCode: number, error: ApiError): void {
  res.status(statusCode).json({ success: false, error });
}

export async function refreshController(req: Request, res: Response): Promise<void> {
  try {
    const result = await refreshAppSessionFromRequest(req);
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({ success: true, data: result.session });
  } catch (error) {
    const authError = error as Partial<ApiError>;
    clearRefreshCookie(res);
    sendError(res, 401, {
      code: authError.code ?? 'SESSION_EXPIRED',
      message: 'Your session expired. Please sign in again.',
      details: process.env.NODE_ENV === 'production' ? undefined : authError.details,
    });
  }
}

export default refreshController;
