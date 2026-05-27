"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.geographicRouter = void 0;
const express_1 = require("express");
const async_handler_1 = require("../../../../lib/async-handler");
const auth_middleware_1 = require("../../../../middelware/auth.middleware");
const authorization_middleware_1 = require("../../../../middelware/authorization.middleware");
const validate_middleware_1 = require("../../../../middelware/validate.middleware");
const geographic_1 = require("../../controllers/geographic");
const geographic_2 = require("../../validators/geographic");
function schemaValidator(schema) {
    return {
        validate: (payload) => {
            const parsed = schema.safeParse(payload);
            if (!parsed.success) {
                return { success: false, error: parsed.error.issues };
            }
            return { success: true, data: parsed.data };
        },
    };
}
const geographicRouter = (0, express_1.Router)();
exports.geographicRouter = geographicRouter;
geographicRouter.get('/provinces', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.provinceListQuerySchema), 'query'), (0, async_handler_1.asyncHandler)(geographic_1.listProvincesController));
geographicRouter.get('/provinces/region/:region', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.provincesByRegionParamSchema), 'params'), (0, async_handler_1.asyncHandler)(geographic_1.getProvincesByRegionController));
geographicRouter.get('/provinces/:id', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.provinceIdParamSchema), 'params'), (0, async_handler_1.asyncHandler)(geographic_1.getProvinceController));
geographicRouter.post('/provinces', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.provinceCreateSchema)), (0, async_handler_1.asyncHandler)(geographic_1.createProvinceController));
geographicRouter.patch('/provinces/:id', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.provinceIdParamSchema), 'params'), (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.provinceUpdateSchema)), (0, async_handler_1.asyncHandler)(geographic_1.updateProvinceController));
geographicRouter.delete('/provinces/:id', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.provinceIdParamSchema), 'params'), (0, async_handler_1.asyncHandler)(geographic_1.deleteProvinceController));
geographicRouter.get('/districts', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.districtListQuerySchema), 'query'), (0, async_handler_1.asyncHandler)(geographic_1.listDistrictsController));
geographicRouter.get('/districts/province/:provinceId', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.districtsByProvinceParamSchema), 'params'), (0, async_handler_1.asyncHandler)(geographic_1.getDistrictsByProvinceController));
geographicRouter.get('/districts/:id', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.districtIdParamSchema), 'params'), (0, async_handler_1.asyncHandler)(geographic_1.getDistrictController));
geographicRouter.post('/districts', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.districtCreateSchema)), (0, async_handler_1.asyncHandler)(geographic_1.createDistrictController));
geographicRouter.patch('/districts/:id', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.districtIdParamSchema), 'params'), (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.districtUpdateSchema)), (0, async_handler_1.asyncHandler)(geographic_1.updateDistrictController));
geographicRouter.delete('/districts/:id', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.districtIdParamSchema), 'params'), (0, async_handler_1.asyncHandler)(geographic_1.deleteDistrictController));
geographicRouter.get('/municipalities', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.municipalityListQuerySchema), 'query'), (0, async_handler_1.asyncHandler)(geographic_1.listMunicipalitiesController));
geographicRouter.get('/municipalities/district/:districtId', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.municipalitiesByDistrictParamSchema), 'params'), (0, async_handler_1.asyncHandler)(geographic_1.getMunicipalitiesByDistrictController));
geographicRouter.get('/municipalities/:id', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.municipalityIdParamSchema), 'params'), (0, async_handler_1.asyncHandler)(geographic_1.getMunicipalityController));
geographicRouter.post('/municipalities', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.municipalityCreateSchema)), (0, async_handler_1.asyncHandler)(geographic_1.createMunicipalityController));
geographicRouter.patch('/municipalities/:id', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.municipalityIdParamSchema), 'params'), (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.municipalityUpdateSchema)), (0, async_handler_1.asyncHandler)(geographic_1.updateMunicipalityController));
geographicRouter.delete('/municipalities/:id', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.municipalityIdParamSchema), 'params'), (0, async_handler_1.asyncHandler)(geographic_1.deleteMunicipalityController));
geographicRouter.get('/search', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.locationSearchQuerySchema), 'query'), (0, async_handler_1.asyncHandler)(geographic_1.searchLocationController));
geographicRouter.get('/hierarchy', auth_middleware_1.authMiddleware, authorization_middleware_1.requireActiveUser, (0, validate_middleware_1.validateMiddleware)(schemaValidator(geographic_2.hierarchyQuerySchema), 'query'), (0, async_handler_1.asyncHandler)(geographic_1.getLocationHierarchyController));
exports.default = geographicRouter;
