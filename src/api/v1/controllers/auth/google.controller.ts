import type { Request, Response } from 'express';
import { completeGoogleSignup, exchangeGoogleSession } from '../../../../services/auth';
import {
  getRequestSessionMetadata,
  setRefreshCookie,
  stripRefreshToken,
  tryCreateAppRefreshSession,
} from '../../../../services/auth/http-session.service';

interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

function sendError(res: Response, statusCode: number, error: ApiError): void {
  res.status(statusCode).json({ success: false, error });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function exchangeGoogleSessionController(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body ?? {};
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
    const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : undefined;

    if (!accessToken) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'accessToken is required.',
      });
      return;
    }

    const result = await exchangeGoogleSession({
      accessToken,
      refreshToken,
    });

    if (result.status === 'complete' && result.session.refreshToken) {
      const persistence = await tryCreateAppRefreshSession(
        result.session.user,
        result.session.refreshToken,
        result.session.accessToken,
        getRequestSessionMetadata(req)
      );

      if (persistence.ok) {
        setRefreshCookie(res, result.session.refreshToken);
      }

      res.status(200).json({
        success: true,
        data: {
          ...result,
          session: stripRefreshToken(result.session),
          ...(persistence.warning ? { refreshWarning: persistence.warning } : {}),
        },
      });
      return;
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    const err = error as Partial<ApiError>;
    const code = err.code ?? 'GOOGLE_EXCHANGE_FAILED';
    const statusCode = code === 'INVALID_CREDENTIALS' ? 401 : 400;

    sendError(res, statusCode, {
      code,
      message: err.message ?? 'Failed to process Google authentication.',
      details: err.details,
    });
  }
}

export async function completeGoogleSignupController(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body ?? {};
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
    const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : undefined;
    const role = typeof body.role === 'string' ? body.role.trim().toLowerCase() : '';
    const firstName = typeof body.firstName === 'string' ? body.firstName : '';
    const lastName = typeof body.lastName === 'string' ? body.lastName : '';

    if (!accessToken) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'accessToken is required.',
      });
      return;
    }

    if (role !== 'admin' && role !== 'staff' && role !== 'donor') {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: "role must be 'admin', 'staff', or 'donor'.",
      });
      return;
    }

    const organization = isRecord(body.organization)
      ? {
          name: typeof body.organization.name === 'string' ? body.organization.name : '',
          code: typeof body.organization.code === 'string' ? body.organization.code : '',
        }
      : undefined;

    const orgCode = typeof body.org_code === 'string' ? body.org_code : undefined;

    const session = await completeGoogleSignup({
      accessToken,
      refreshToken,
      role: role as 'admin' | 'staff' | 'donor',
      firstName,
      lastName,
      blood_type: typeof body.blood_type === 'string' ? body.blood_type as any : undefined,
      phone_number: typeof body.phone_number === 'string' ? body.phone_number : undefined,
      province: typeof body.province === 'string' ? body.province : undefined,
      city: typeof body.city === 'string' ? body.city : undefined,
      organization,
      org_code: orgCode,
    });

    if (session.refreshToken) {
      const persistence = await tryCreateAppRefreshSession(
        session.user,
        session.refreshToken,
        session.accessToken,
        getRequestSessionMetadata(req)
      );

      if (persistence.ok) {
        setRefreshCookie(res, session.refreshToken);
      }

      res.status(200).json({
        success: true,
        data: {
          ...stripRefreshToken(session),
          ...(persistence.warning ? { refreshWarning: persistence.warning } : {}),
        },
      });
      return;
    }

    res.status(200).json({ success: true, data: stripRefreshToken(session) });
  } catch (error) {
    const err = error as Partial<ApiError>;
    const code = err.code ?? 'GOOGLE_SIGNUP_COMPLETION_FAILED';
    const statusCode = code === 'INVALID_CREDENTIALS' ? 401 : 400;

    sendError(res, statusCode, {
      code,
      message: err.message ?? 'Failed to complete Google signup.',
      details: err.details,
    });
  }
}
