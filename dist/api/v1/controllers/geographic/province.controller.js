"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProvincesController = listProvincesController;
exports.getProvinceController = getProvinceController;
exports.createProvinceController = createProvinceController;
exports.updateProvinceController = updateProvinceController;
exports.deleteProvinceController = deleteProvinceController;
exports.getProvincesByRegionController = getProvincesByRegionController;
exports.searchLocationController = searchLocationController;
exports.getLocationHierarchyController = getLocationHierarchyController;
const geographic_service_1 = require("../../../../services/geographic/geographic.service");
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
function isAuthorizedUser(user) {
    return Boolean(user?.id && user.is_active !== false);
}
function isSuperAdmin(user) {
    return user?.role?.type === 'super_admin';
}
function parseOptionalNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}
async function listProvincesController(req, res) {
    try {
        if (!isAuthorizedUser(req.user)) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated user required.',
            });
            return;
        }
        const result = await geographic_service_1.geographicService.listProvinces({
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
    }
    catch (error) {
        sendError(res, 500, {
            code: 'PROVINCE_LIST_ERROR',
            message: 'Unexpected error while fetching provinces.',
            details: error,
        });
    }
}
async function getProvinceController(req, res) {
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
        const result = await geographic_service_1.geographicService.getProvinceById(req.user.org_id, provinceId);
        if (result.error || !result.data) {
            sendError(res, 404, {
                code: result.error?.code ?? 'PROVINCE_NOT_FOUND',
                message: result.error?.message ?? 'Province not found.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'PROVINCE_FETCH_ERROR',
            message: 'Unexpected error while fetching province.',
            details: error,
        });
    }
}
async function createProvinceController(req, res) {
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
        const payload = req.body;
        const result = await geographic_service_1.geographicService.createProvince(payload);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'PROVINCE_CREATE_FAILED',
                message: result.error?.message ?? 'Failed to create province.',
                details: result.error?.details,
            });
            return;
        }
        res.status(201).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'PROVINCE_CREATE_ERROR',
            message: 'Unexpected error while creating province.',
            details: error,
        });
    }
}
async function updateProvinceController(req, res) {
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
        const payload = req.body;
        const result = await geographic_service_1.geographicService.updateProvince(provinceId, payload);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'PROVINCE_UPDATE_FAILED',
                message: result.error?.message ?? 'Failed to update province.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'PROVINCE_UPDATE_ERROR',
            message: 'Unexpected error while updating province.',
            details: error,
        });
    }
}
async function deleteProvinceController(req, res) {
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
        const result = await geographic_service_1.geographicService.deleteProvince(provinceId);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'PROVINCE_DELETE_FAILED',
                message: result.error?.message ?? 'Failed to delete province.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'PROVINCE_DELETE_ERROR',
            message: 'Unexpected error while deleting province.',
            details: error,
        });
    }
}
async function getProvincesByRegionController(req, res) {
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
        const result = await geographic_service_1.geographicService.getProvincesByRegion(req.user.org_id, region);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'PROVINCE_LIST_FAILED',
                message: result.error?.message ?? 'Failed to fetch provinces by region.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'PROVINCE_LIST_ERROR',
            message: 'Unexpected error while fetching provinces by region.',
            details: error,
        });
    }
}
async function searchLocationController(req, res) {
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
        const result = await geographic_service_1.geographicService.searchLocation({
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
    }
    catch (error) {
        sendError(res, 500, {
            code: 'LOCATION_SEARCH_ERROR',
            message: 'Unexpected error while searching locations.',
            details: error,
        });
    }
}
async function getLocationHierarchyController(req, res) {
    try {
        if (!isAuthorizedUser(req.user)) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated user required.',
            });
            return;
        }
        const result = await geographic_service_1.geographicService.getLocationHierarchy({
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
    }
    catch (error) {
        sendError(res, 500, {
            code: 'LOCATION_HIERARCHY_ERROR',
            message: 'Unexpected error while fetching location hierarchy.',
            details: error,
        });
    }
}
