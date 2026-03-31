import { loginWithEmailPassword } from '../../../../services/auth';
import { validateLogin } from '../../validators/auth';

interface AuthenticatedUser {
  id: string;
  is_active?: boolean;
}

interface Request {
  body?: unknown;
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

    res.status(200).json({
      success: true,
      data: result,
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