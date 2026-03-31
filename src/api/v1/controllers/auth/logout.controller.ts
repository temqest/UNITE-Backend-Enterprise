import { logout } from '../../../../services/auth';

interface AuthenticatedUser {
  id: string;
  is_active?: boolean;
}

interface Request {
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

export async function logoutController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
      return;
    }

    if (req.user.is_active === false) {
      sendError(res, 403, {
        code: 'INACTIVE_USER',
        message: 'Inactive users cannot perform logout actions.',
      });
      return;
    }

    const result = await logout();
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    const authError = error as Partial<ApiError>;
    sendError(res, 500, {
      code: authError.code ?? 'LOGOUT_FAILED',
      message: authError.message ?? 'Failed to logout.',
      details: authError.details,
    });
  }
}
