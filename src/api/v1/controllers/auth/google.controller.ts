import { completeGoogleSignup, exchangeGoogleSession } from '../../../../services/auth';

interface Request {
  body?: Record<string, unknown>;
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

    if (role !== 'admin' && role !== 'staff') {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: "role must be either 'admin' or 'staff'.",
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
      role,
      firstName,
      lastName,
      organization,
      org_code: orgCode,
    });

    res.status(200).json({ success: true, data: session });
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
