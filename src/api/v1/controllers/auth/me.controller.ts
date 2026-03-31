import { resolveUserAuthorization } from '../../../../services/auth/authorization.service';

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
    if (!req.user?.id) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Authenticated user required.',
      });
      return;
    }

    const resolved = await resolveUserAuthorization(req.user);

    res.status(200).json({
      success: true,
      data: {
        id: req.user.id,
        role: resolved.role,
        org_id: req.user.org_id ?? null,
        active: req.user.is_active !== false,
        resolved_permissions_count: resolved.permissions.length,
        resolved_permissions: resolved.permissions,
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
