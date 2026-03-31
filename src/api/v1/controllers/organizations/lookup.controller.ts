import { supabaseServer } from '../../../../lib/supabase/supabase.client';
import { OrganizationService } from '../../../../services/organization/organization.service';

interface AuthenticatedUser {
  id: string;
}

interface Request {
  query?: Record<string, unknown>;
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

function sendError(
  res: Response,
  statusCode: number,
  error: ApiError
): void {
  res.status(statusCode).json({ success: false, error });
}

export async function lookupOrganizationByCodeController(req: Request, res: Response): Promise<void> {
  try {
    const codeRaw = req.query?.code;
    if (typeof codeRaw !== 'string' || !codeRaw.trim()) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message: 'code is required for organization lookup.',
      });
      return;
    }

    const orgService = new OrganizationService(supabaseServer);

    const result = await orgService.validateOrganizationCode(codeRaw);
    if (result.error) {
      sendError(res, 400, {
        code: result.error.code,
        message: result.error.message,
        details: result.error.details,
      });
      return;
    }

    // For onboarding preview, we return `data: null` when not found/inactive
    // but still succeed the HTTP request.
    const organization = result.data?.organization ?? null;

    res.status(200).json({
      success: true,
      data: organization
        ? {
            id: organization.id,
            name: organization.name,
            code: organization.code,
            is_active: organization.is_active,
          }
        : null,
    });
  } catch (error) {
    const err = error as Partial<ApiError>;
    sendError(res, 500, {
      code: err.code ?? 'ORG_LOOKUP_ERROR',
      message: err.message ?? 'Unexpected error during organization lookup.',
      details: err.details,
    });
  }
}

