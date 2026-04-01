"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDistrictsController = listDistrictsController;
exports.getDistrictController = getDistrictController;
exports.createDistrictController = createDistrictController;
exports.updateDistrictController = updateDistrictController;
exports.deleteDistrictController = deleteDistrictController;
exports.getDistrictsByProvinceController = getDistrictsByProvinceController;
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
async function listDistrictsController(req, res) {
    try {
        if (!isAuthorizedUser(req.user)) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated user required.',
            });
            return;
        }
        const result = await geographic_service_1.geographicService.listDistricts({
            org_id: req.user.org_id,
            province_id: typeof req.query?.province_id === 'string' ? req.query.province_id : undefined,
            search: typeof req.query?.search === 'string' ? req.query.search : undefined,
            limit: parseOptionalNumber(req.query?.limit),
            offset: parseOptionalNumber(req.query?.offset),
        });
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'DISTRICT_LIST_FAILED',
                message: result.error?.message ?? 'Failed to fetch districts.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'DISTRICT_LIST_ERROR',
            message: 'Unexpected error while fetching districts.',
            details: error,
        });
    }
}
async function getDistrictController(req, res) {
    try {
        if (!isAuthorizedUser(req.user)) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated user required.',
            });
            return;
        }
        const districtId = req.params?.id;
        if (!districtId) {
            sendError(res, 400, {
                code: 'DISTRICT_ID_REQUIRED',
                message: 'District id is required.',
            });
            return;
        }
        const result = await geographic_service_1.geographicService.getDistrictById(req.user.org_id, districtId);
        if (result.error || !result.data) {
            sendError(res, 404, {
                code: result.error?.code ?? 'DISTRICT_NOT_FOUND',
                message: result.error?.message ?? 'District not found.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'DISTRICT_FETCH_ERROR',
            message: 'Unexpected error while fetching district.',
            details: error,
        });
    }
}
async function createDistrictController(req, res) {
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
                message: 'Only super_admin can create districts.',
            });
            return;
        }
        const payload = req.body;
        const result = await geographic_service_1.geographicService.createDistrict(payload);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'DISTRICT_CREATE_FAILED',
                message: result.error?.message ?? 'Failed to create district.',
                details: result.error?.details,
            });
            return;
        }
        res.status(201).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'DISTRICT_CREATE_ERROR',
            message: 'Unexpected error while creating district.',
            details: error,
        });
    }
}
async function updateDistrictController(req, res) {
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
                message: 'Only super_admin can update districts.',
            });
            return;
        }
        const districtId = req.params?.id;
        if (!districtId) {
            sendError(res, 400, {
                code: 'DISTRICT_ID_REQUIRED',
                message: 'District id is required.',
            });
            return;
        }
        const payload = req.body;
        const result = await geographic_service_1.geographicService.updateDistrict(districtId, payload);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'DISTRICT_UPDATE_FAILED',
                message: result.error?.message ?? 'Failed to update district.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'DISTRICT_UPDATE_ERROR',
            message: 'Unexpected error while updating district.',
            details: error,
        });
    }
}
async function deleteDistrictController(req, res) {
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
                message: 'Only super_admin can delete districts.',
            });
            return;
        }
        const districtId = req.params?.id;
        if (!districtId) {
            sendError(res, 400, {
                code: 'DISTRICT_ID_REQUIRED',
                message: 'District id is required.',
            });
            return;
        }
        const result = await geographic_service_1.geographicService.deleteDistrict(districtId);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'DISTRICT_DELETE_FAILED',
                message: result.error?.message ?? 'Failed to delete district.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'DISTRICT_DELETE_ERROR',
            message: 'Unexpected error while deleting district.',
            details: error,
        });
    }
}
async function getDistrictsByProvinceController(req, res) {
    try {
        if (!isAuthorizedUser(req.user)) {
            sendError(res, 401, {
                code: 'UNAUTHORIZED',
                message: 'Active authenticated user required.',
            });
            return;
        }
        const provinceId = req.params?.provinceId;
        if (!provinceId) {
            sendError(res, 400, {
                code: 'PROVINCE_ID_REQUIRED',
                message: 'provinceId path parameter is required.',
            });
            return;
        }
        const result = await geographic_service_1.geographicService.getDistrictsByProvince(req.user.org_id, provinceId);
        if (result.error || !result.data) {
            sendError(res, 400, {
                code: result.error?.code ?? 'DISTRICT_LIST_FAILED',
                message: result.error?.message ?? 'Failed to fetch districts by province.',
                details: result.error?.details,
            });
            return;
        }
        res.status(200).json({ success: true, data: result.data });
    }
    catch (error) {
        sendError(res, 500, {
            code: 'DISTRICT_LIST_ERROR',
            message: 'Unexpected error while fetching districts by province.',
            details: error,
        });
    }
}
