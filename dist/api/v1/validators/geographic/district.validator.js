"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.districtUpdateSchema = exports.districtCreateSchema = exports.districtListQuerySchema = exports.districtsByProvinceParamSchema = exports.districtIdParamSchema = void 0;
const zod_1 = require("zod");
exports.districtIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().uuid({ message: 'id must be a valid UUID' }),
});
exports.districtsByProvinceParamSchema = zod_1.z.object({
    provinceId: zod_1.z.string().uuid({ message: 'provinceId must be a valid UUID' }),
});
exports.districtListQuerySchema = zod_1.z.object({
    province_id: zod_1.z.string().uuid().optional(),
    search: zod_1.z.string().trim().min(1).max(120).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(1000).optional(),
    offset: zod_1.z.coerce.number().int().min(0).optional(),
});
exports.districtCreateSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid().nullable().optional(),
    province_id: zod_1.z.string().uuid(),
    name: zod_1.z.string().trim().min(2).max(150),
    code: zod_1.z.string().trim().min(2).max(64),
});
exports.districtUpdateSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid().nullable().optional(),
    province_id: zod_1.z.string().uuid().optional(),
    name: zod_1.z.string().trim().min(2).max(150).optional(),
    code: zod_1.z.string().trim().min(2).max(64).optional(),
}).refine((payload) => Object.values(payload).some((value) => value !== undefined), { message: 'At least one field must be provided for update' });
