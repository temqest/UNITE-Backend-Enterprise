import { geographicService } from '../../../../services/geographic/geographic.service';
import type {
  MunicipalityCreateInput,
  MunicipalityUpdateInput,
} from '../../../../models/geographic/municipalities/types';

interface AuthenticatedUser {
  id: string;
  org_id?: string;
  is_active?: boolean;
  role?: {
    type?: string;
    permissions?: string[];
  };
}

interface Request {
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
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

function isAuthorizedUser(user: AuthenticatedUser | undefined): user is AuthenticatedUser {
  return Boolean(user?.id && user.is_active !== false);
}

function isSuperAdmin(user: AuthenticatedUser | undefined): boolean {
  return user?.role?.type === 'super_admin';
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export async function listMunicipalitiesController(req: Request, res: Response): Promise<void> {
  try {
    if (!isAuthorizedUser(req.user)) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    const result = await geographicService.listMunicipalities({
      org_id: req.user.org_id,
      province_id: typeof req.query?.province_id === 'string' ? req.query.province_id : undefined,
      district_id: typeof req.query?.district_id === 'string' ? req.query.district_id : undefined,
      search: typeof req.query?.search === 'string' ? req.query.search : undefined,
      limit: parseOptionalNumber(req.query?.limit),
      offset: parseOptionalNumber(req.query?.offset),
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'MUNICIPALITY_LIST_FAILED',
        message: result.error?.message ?? 'Failed to fetch municipalities.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'MUNICIPALITY_LIST_ERROR',
      message: 'Unexpected error while fetching municipalities.',
      details: error,
    });
  }
}

export async function getMunicipalityController(req: Request, res: Response): Promise<void> {
  try {
    if (!isAuthorizedUser(req.user)) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    const municipalityId = req.params?.id;
    if (!municipalityId) {
      sendError(res, 400, {
        code: 'MUNICIPALITY_ID_REQUIRED',
        message: 'Municipality id is required.',
      });
      return;
    }

    const result = await geographicService.getMunicipalityById(req.user.org_id, municipalityId);
    if (result.error || !result.data) {
      sendError(res, 404, {
        code: result.error?.code ?? 'MUNICIPALITY_NOT_FOUND',
        message: result.error?.message ?? 'Municipality not found.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'MUNICIPALITY_FETCH_ERROR',
      message: 'Unexpected error while fetching municipality.',
      details: error,
    });
  }
}

export async function createMunicipalityController(req: Request, res: Response): Promise<void> {
  try {
    if (!isAuthorizedUser(req.user)) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    if (!isSuperAdmin(req.user)) {
      sendError(res, 403, {
        code: 'FORBIDDEN',
        message: 'Only super_admin can create municipalities.',
      });
      return;
    }

    const payload = req.body as unknown as MunicipalityCreateInput;
    const result = await geographicService.createMunicipality(payload);

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'MUNICIPALITY_CREATE_FAILED',
        message: result.error?.message ?? 'Failed to create municipality.',
        details: result.error?.details,
      });
      return;
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'MUNICIPALITY_CREATE_ERROR',
      message: 'Unexpected error while creating municipality.',
      details: error,
    });
  }
}

export async function updateMunicipalityController(req: Request, res: Response): Promise<void> {
  try {
    if (!isAuthorizedUser(req.user)) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    if (!isSuperAdmin(req.user)) {
      sendError(res, 403, {
        code: 'FORBIDDEN',
        message: 'Only super_admin can update municipalities.',
      });
      return;
    }

    const municipalityId = req.params?.id;
    if (!municipalityId) {
      sendError(res, 400, {
        code: 'MUNICIPALITY_ID_REQUIRED',
        message: 'Municipality id is required.',
      });
      return;
    }

    const payload = req.body as MunicipalityUpdateInput;
    const result = await geographicService.updateMunicipality(municipalityId, payload);

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'MUNICIPALITY_UPDATE_FAILED',
        message: result.error?.message ?? 'Failed to update municipality.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'MUNICIPALITY_UPDATE_ERROR',
      message: 'Unexpected error while updating municipality.',
      details: error,
    });
  }
}

export async function deleteMunicipalityController(req: Request, res: Response): Promise<void> {
  try {
    if (!isAuthorizedUser(req.user)) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    if (!isSuperAdmin(req.user)) {
      sendError(res, 403, {
        code: 'FORBIDDEN',
        message: 'Only super_admin can delete municipalities.',
      });
      return;
    }

    const municipalityId = req.params?.id;
    if (!municipalityId) {
      sendError(res, 400, {
        code: 'MUNICIPALITY_ID_REQUIRED',
        message: 'Municipality id is required.',
      });
      return;
    }

    const result = await geographicService.deleteMunicipality(municipalityId);

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'MUNICIPALITY_DELETE_FAILED',
        message: result.error?.message ?? 'Failed to delete municipality.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'MUNICIPALITY_DELETE_ERROR',
      message: 'Unexpected error while deleting municipality.',
      details: error,
    });
  }
}

export async function getMunicipalitiesByDistrictController(req: Request, res: Response): Promise<void> {
  try {
    if (!isAuthorizedUser(req.user)) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    const districtId = req.params?.districtId;
    if (!districtId) {
      sendError(res, 400, {
        code: 'DISTRICT_ID_REQUIRED',
        message: 'districtId path parameter is required.',
      });
      return;
    }

    const result = await geographicService.getMunicipalitiesByDistrict(req.user.org_id, districtId);

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'MUNICIPALITY_LIST_FAILED',
        message: result.error?.message ?? 'Failed to fetch municipalities by district.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'MUNICIPALITY_LIST_ERROR',
      message: 'Unexpected error while fetching municipalities by district.',
      details: error,
    });
  }
}
