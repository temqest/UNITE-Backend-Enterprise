import { validateSession } from '../../../../services/auth/session.service';

interface UserRole {
  type?: string;
  permissions?: string[];
}

interface AuthenticatedUser {
  id: string;
  org_id?: string;
  is_active?: boolean;
  role?: UserRole;
}

interface Request {
  user?: AuthenticatedUser;
  headers?: Record<string, string | string[] | undefined>;
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

export async function meController(req: Request, res: Response): Promise<void> {
  try {
    const authHeader = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!req.user?.id || !accessToken) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Authenticated user required.',
      });
      return;
    }

    const session = await validateSession(accessToken);
    if (!session.isValid || !session.user) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Session is no longer valid.',
        details: session.reason,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        user: session.user,
        organization: session.organization,
        accessToken,
        redirectTo: String(session.user.role?.type ?? '').toLowerCase() === 'donor'
          ? '/donor/dashboard'
          : '/dashboard',
      },
    });
  } catch (error) {
    sendError(res, 500, {
      code: 'AUTH_DIAGNOSTICS_ERROR',
      message: 'Failed to resolve auth diagnostics.',
      details: process.env.NODE_ENV === 'production' ? undefined : error,
    });
  }
}

export default meController;
