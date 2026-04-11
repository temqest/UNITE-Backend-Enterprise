import { type Request, type Response, type NextFunction } from 'express';
import { resolveCanonicalRole } from '../services/auth/rbac.constants';

interface AuthenticatedUser {
  id: string;
  auth_id?: string;
  org_id?: string;
  is_active?: boolean;
  canonical_role?: string;
  role?: {
    type?: string;
    permissions?: string[];
  };
}

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

function sendError(res: Response, statusCode: number, error: ApiError): void {
  res.status(statusCode).json({ success: false, error });
}

function getRequestId(req: Request): string {
  const header = req.headers['x-request-id'];
  return typeof header === 'string' && header.trim().length > 0 ? header : 'unknown';
}

function logAuthDecision(
  req: Request,
  decision: 'allow' | 'deny',
  reasonCode: string,
  userId: string,
  role: string,
  orgId: string
): void {
  const payload = {
    requestId: getRequestId(req),
    userId,
    role,
    orgId,
    endpoint: `${req.method} ${req.originalUrl || req.url}`,
    decision,
    reasonCode,
  };

  const output = `[auth] ${JSON.stringify(payload)}`;
  if (decision === 'deny') {
    console.warn(output);
    return;
  }
  console.info(output);
}

type GetUserFromRequestFn = (authHeader?: string) => Promise<any>;

async function defaultGetUserFromRequest(authHeader?: string): Promise<any> {
  const authService = await import('../services/auth/session.service.js');
  return authService.getUserFromRequest(authHeader);
}

export function createAuthMiddleware(getUserFromRequestFn: GetUserFromRequestFn = defaultGetUserFromRequest) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logAuthDecision(req, 'deny', 'MISSING_TOKEN', 'anonymous', 'unknown', 'none');
        sendError(res, 401, {
          code: 'MISSING_TOKEN',
          message: 'Authorization token is required.',
        });
        return;
      }

      const user = await getUserFromRequestFn(authHeader);

      if (!user) {
        logAuthDecision(req, 'deny', 'UNAUTHORIZED', 'anonymous', 'unknown', 'none');
        sendError(res, 401, {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated.',
        });
        return;
      }

      const roleType = user.role?.type;
      req.user = {
        id: user.id,
        auth_id: user.auth_id ?? user.id,
        org_id: user.org_id,
        is_active: user.is_active,
        canonical_role: resolveCanonicalRole(roleType),
        role: user.role,
      };

      logAuthDecision(
        req,
        'allow',
        'AUTHENTICATED',
        req.user.id,
        req.user.canonical_role ?? 'unknown',
        req.user.org_id ?? 'none'
      );

      next();
    } catch (error) {
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';

      if (errorCode === 'UNKNOWN_ERROR') {
        logAuthDecision(req, 'deny', 'UNAUTHORIZED', 'anonymous', 'unknown', 'none');
        sendError(res, 401, {
          code: 'UNAUTHORIZED',
          message: 'User profile is missing or account setup is incomplete.',
        });
        return;
      }

      sendError(res, 500, {
        code: 'AUTH_ERROR',
        message: 'Authentication error occurred.',
        details: process.env.NODE_ENV === 'production' ? undefined : error,
      });
    }
  };
}

export const authMiddleware = createAuthMiddleware();

export default authMiddleware;
