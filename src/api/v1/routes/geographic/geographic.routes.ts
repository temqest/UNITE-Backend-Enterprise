import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../../lib/async-handler';
import { authMiddleware } from '../../../../middelware/auth.middleware';
import { validateMiddleware } from '../../../../middelware/validate.middleware';
import {
  createDistrictController,
  createMunicipalityController,
  createProvinceController,
  deleteDistrictController,
  deleteMunicipalityController,
  deleteProvinceController,
  getDistrictController,
  getDistrictsByProvinceController,
  getLocationHierarchyController,
  getMunicipalitiesByDistrictController,
  getMunicipalityController,
  getProvinceController,
  getProvincesByRegionController,
  listDistrictsController,
  listMunicipalitiesController,
  listProvincesController,
  searchLocationController,
  updateDistrictController,
  updateMunicipalityController,
  updateProvinceController,
} from '../../controllers/geographic';
import {
  districtCreateSchema,
  districtIdParamSchema,
  districtListQuerySchema,
  districtUpdateSchema,
  districtsByProvinceParamSchema,
  hierarchyQuerySchema,
  locationSearchQuerySchema,
  municipalitiesByDistrictParamSchema,
  municipalityCreateSchema,
  municipalityIdParamSchema,
  municipalityListQuerySchema,
  municipalityUpdateSchema,
  provinceCreateSchema,
  provinceIdParamSchema,
  provinceListQuerySchema,
  provincesByRegionParamSchema,
  provinceUpdateSchema,
} from '../../validators/geographic';

type ValidationResult =
  | { success: true; data: unknown }
  | { success: false; error: unknown };

function schemaValidator(schema: z.ZodTypeAny): { validate: (payload: unknown) => ValidationResult } {
  return {
    validate: (payload: unknown): ValidationResult => {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues };
      }
      return { success: true, data: parsed.data };
    },
  };
}

const geographicRouter = Router();

geographicRouter.get(
  '/provinces',
  authMiddleware,
  validateMiddleware(schemaValidator(provinceListQuerySchema), 'query'),
  asyncHandler(listProvincesController as any)
);

geographicRouter.get(
  '/provinces/region/:region',
  authMiddleware,
  validateMiddleware(schemaValidator(provincesByRegionParamSchema), 'params'),
  asyncHandler(getProvincesByRegionController as any)
);

geographicRouter.get(
  '/provinces/:id',
  authMiddleware,
  validateMiddleware(schemaValidator(provinceIdParamSchema), 'params'),
  asyncHandler(getProvinceController as any)
);

geographicRouter.post(
  '/provinces',
  authMiddleware,
  validateMiddleware(schemaValidator(provinceCreateSchema)),
  asyncHandler(createProvinceController as any)
);

geographicRouter.patch(
  '/provinces/:id',
  authMiddleware,
  validateMiddleware(schemaValidator(provinceIdParamSchema), 'params'),
  validateMiddleware(schemaValidator(provinceUpdateSchema)),
  asyncHandler(updateProvinceController as any)
);

geographicRouter.delete(
  '/provinces/:id',
  authMiddleware,
  validateMiddleware(schemaValidator(provinceIdParamSchema), 'params'),
  asyncHandler(deleteProvinceController as any)
);

geographicRouter.get(
  '/districts',
  authMiddleware,
  validateMiddleware(schemaValidator(districtListQuerySchema), 'query'),
  asyncHandler(listDistrictsController as any)
);

geographicRouter.get(
  '/districts/province/:provinceId',
  authMiddleware,
  validateMiddleware(schemaValidator(districtsByProvinceParamSchema), 'params'),
  asyncHandler(getDistrictsByProvinceController as any)
);

geographicRouter.get(
  '/districts/:id',
  authMiddleware,
  validateMiddleware(schemaValidator(districtIdParamSchema), 'params'),
  asyncHandler(getDistrictController as any)
);

geographicRouter.post(
  '/districts',
  authMiddleware,
  validateMiddleware(schemaValidator(districtCreateSchema)),
  asyncHandler(createDistrictController as any)
);

geographicRouter.patch(
  '/districts/:id',
  authMiddleware,
  validateMiddleware(schemaValidator(districtIdParamSchema), 'params'),
  validateMiddleware(schemaValidator(districtUpdateSchema)),
  asyncHandler(updateDistrictController as any)
);

geographicRouter.delete(
  '/districts/:id',
  authMiddleware,
  validateMiddleware(schemaValidator(districtIdParamSchema), 'params'),
  asyncHandler(deleteDistrictController as any)
);

geographicRouter.get(
  '/municipalities',
  authMiddleware,
  validateMiddleware(schemaValidator(municipalityListQuerySchema), 'query'),
  asyncHandler(listMunicipalitiesController as any)
);

geographicRouter.get(
  '/municipalities/district/:districtId',
  authMiddleware,
  validateMiddleware(schemaValidator(municipalitiesByDistrictParamSchema), 'params'),
  asyncHandler(getMunicipalitiesByDistrictController as any)
);

geographicRouter.get(
  '/municipalities/:id',
  authMiddleware,
  validateMiddleware(schemaValidator(municipalityIdParamSchema), 'params'),
  asyncHandler(getMunicipalityController as any)
);

geographicRouter.post(
  '/municipalities',
  authMiddleware,
  validateMiddleware(schemaValidator(municipalityCreateSchema)),
  asyncHandler(createMunicipalityController as any)
);

geographicRouter.patch(
  '/municipalities/:id',
  authMiddleware,
  validateMiddleware(schemaValidator(municipalityIdParamSchema), 'params'),
  validateMiddleware(schemaValidator(municipalityUpdateSchema)),
  asyncHandler(updateMunicipalityController as any)
);

geographicRouter.delete(
  '/municipalities/:id',
  authMiddleware,
  validateMiddleware(schemaValidator(municipalityIdParamSchema), 'params'),
  asyncHandler(deleteMunicipalityController as any)
);

geographicRouter.get(
  '/search',
  authMiddleware,
  validateMiddleware(schemaValidator(locationSearchQuerySchema), 'query'),
  asyncHandler(searchLocationController as any)
);

geographicRouter.get(
  '/hierarchy',
  authMiddleware,
  validateMiddleware(schemaValidator(hierarchyQuerySchema), 'query'),
  asyncHandler(getLocationHierarchyController as any)
);

export { geographicRouter };
export default geographicRouter;
