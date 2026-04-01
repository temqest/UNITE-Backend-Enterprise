"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.municipalityUpdateSchema = exports.municipalityCreateSchema = exports.municipalityListQuerySchema = exports.municipalitiesByDistrictParamSchema = exports.municipalityIdParamSchema = void 0;
const zod_1 = require("zod");
exports.municipalityIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().uuid({ message: 'id must be a valid UUID' }),
});
exports.municipalitiesByDistrictParamSchema = zod_1.z.object({
    districtId: zod_1.z.string().uuid({ message: 'districtId must be a valid UUID' }),
});
exports.municipalityListQuerySchema = zod_1.z.object({
    province_id: zod_1.z.string().uuid().optional(),
    district_id: zod_1.z.string().uuid().optional(),
    search: zod_1.z.string().trim().min(1).max(120).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(5000).optional(),
    offset: zod_1.z.coerce.number().int().min(0).optional(),
});
exports.municipalityCreateSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid().nullable().optional(),
    district_id: zod_1.z.string().uuid(),
    province_id: zod_1.z.string().uuid(),
    name: zod_1.z.string().trim().min(2).max(150),
    code: zod_1.z.string().trim().min(2).max(64),
});
exports.municipalityUpdateSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid().nullable().optional(),
    district_id: zod_1.z.string().uuid().optional(),
    province_id: zod_1.z.string().uuid().optional(),
    name: zod_1.z.string().trim().min(2).max(150).optional(),
    code: zod_1.z.string().trim().min(2).max(64).optional(),
}).refine((payload) => Object.values(payload).some((value) => value !== undefined), { message: 'At least one field must be provided for update' });
