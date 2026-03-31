import { geographicService } from '../../../../services/geographic/geographic.service';
import type { ProvinceCreateInput, ProvinceUpdateInput } from '../../../../models/geographic/provinces/types';

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

export async function listProvincesController(req: Request, res: Response): Promise<void> {
  try {
    if (!isAuthorizedUser(req.user)) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    const result = await geographicService.listProvinces({
      org_id: req.user.org_id,
      region: typeof req.query?.region === 'string' ? req.query.region : undefined,
      search: typeof req.query?.search === 'string' ? req.query.search : undefined,
      limit: parseOptionalNumber(req.query?.limit),
      offset: parseOptionalNumber(req.query?.offset),
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'PROVINCE_LIST_FAILED',
        message: result.error?.message ?? 'Failed to fetch provinces.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'PROVINCE_LIST_ERROR',
      message: 'Unexpected error while fetching provinces.',
      details: error,
    });
  }
}

export async function getProvinceController(req: Request, res: Response): Promise<void> {
  try {
    if (!isAuthorizedUser(req.user)) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    const provinceId = req.params?.id;
    if (!provinceId) {
      sendError(res, 400, {
        code: 'PROVINCE_ID_REQUIRED',
        message: 'Province id is required.',
      });
      return;
    }

    const result = await geographicService.getProvinceById(req.user.org_id, provinceId);
    if (result.error || !result.data) {
      sendError(res, 404, {
        code: result.error?.code ?? 'PROVINCE_NOT_FOUND',
        message: result.error?.message ?? 'Province not found.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'PROVINCE_FETCH_ERROR',
      message: 'Unexpected error while fetching province.',
      details: error,
    });
  }
}

export async function createProvinceController(req: Request, res: Response): Promise<void> {
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
        message: 'Only super_admin can create provinces.',
      });
      return;
    }

    const payload = req.body as unknown as ProvinceCreateInput;
    const result = await geographicService.createProvince(payload);

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'PROVINCE_CREATE_FAILED',
        message: result.error?.message ?? 'Failed to create province.',
        details: result.error?.details,
      });
      return;
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'PROVINCE_CREATE_ERROR',
      message: 'Unexpected error while creating province.',
      details: error,
    });
  }
}

export async function updateProvinceController(req: Request, res: Response): Promise<void> {
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
        message: 'Only super_admin can update provinces.',
      });
      return;
    }

    const provinceId = req.params?.id;
    if (!provinceId) {
      sendError(res, 400, {
        code: 'PROVINCE_ID_REQUIRED',
        message: 'Province id is required.',
      });
      return;
    }

    const payload = req.body as ProvinceUpdateInput;
    const result = await geographicService.updateProvince(provinceId, payload);

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'PROVINCE_UPDATE_FAILED',
        message: result.error?.message ?? 'Failed to update province.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'PROVINCE_UPDATE_ERROR',
      message: 'Unexpected error while updating province.',
      details: error,
    });
  }
}

export async function deleteProvinceController(req: Request, res: Response): Promise<void> {
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
        message: 'Only super_admin can delete provinces.',
      });
      return;
    }

    const provinceId = req.params?.id;
    if (!provinceId) {
      sendError(res, 400, {
        code: 'PROVINCE_ID_REQUIRED',
        message: 'Province id is required.',
      });
      return;
    }

    const result = await geographicService.deleteProvince(provinceId);

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'PROVINCE_DELETE_FAILED',
        message: result.error?.message ?? 'Failed to delete province.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'PROVINCE_DELETE_ERROR',
      message: 'Unexpected error while deleting province.',
      details: error,
    });
  }
}

export async function getProvincesByRegionController(req: Request, res: Response): Promise<void> {
  try {
    if (!isAuthorizedUser(req.user)) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    const region = req.params?.region;
    if (!region) {
      sendError(res, 400, {
        code: 'REGION_REQUIRED',
        message: 'region path parameter is required.',
      });
      return;
    }

    const result = await geographicService.getProvincesByRegion(req.user.org_id, region);

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'PROVINCE_LIST_FAILED',
        message: result.error?.message ?? 'Failed to fetch provinces by region.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'PROVINCE_LIST_ERROR',
      message: 'Unexpected error while fetching provinces by region.',
      details: error,
    });
  }
}

export async function searchLocationController(req: Request, res: Response): Promise<void> {
  try {
    if (!isAuthorizedUser(req.user)) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    const term = typeof req.query?.term === 'string' ? req.query.term : '';
    if (!term.trim()) {
      sendError(res, 400, {
        code: 'SEARCH_TERM_REQUIRED',
        message: 'term query parameter is required.',
      });
      return;
    }

    const result = await geographicService.searchLocation({
      org_id: req.user.org_id,
      term,
      limit: parseOptionalNumber(req.query?.limit),
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'LOCATION_SEARCH_FAILED',
        message: result.error?.message ?? 'Failed to search locations.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'LOCATION_SEARCH_ERROR',
      message: 'Unexpected error while searching locations.',
      details: error,
    });
  }
}

export async function getLocationHierarchyController(req: Request, res: Response): Promise<void> {
  try {
    if (!isAuthorizedUser(req.user)) {
      sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Active authenticated user required.',
      });
      return;
    }

    const result = await geographicService.getLocationHierarchy({
      org_id: req.user.org_id,
      province_id: typeof req.query?.province_id === 'string' ? req.query.province_id : undefined,
    });

    if (result.error || !result.data) {
      sendError(res, 400, {
        code: result.error?.code ?? 'LOCATION_HIERARCHY_FAILED',
        message: result.error?.message ?? 'Failed to fetch location hierarchy.',
        details: result.error?.details,
      });
      return;
    }

    res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    sendError(res, 500, {
      code: 'LOCATION_HIERARCHY_ERROR',
      message: 'Unexpected error while fetching location hierarchy.',
      details: error,
    });
  }
}
