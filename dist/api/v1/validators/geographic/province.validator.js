"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hierarchyQuerySchema = exports.locationSearchQuerySchema = exports.provincesByRegionParamSchema = exports.provinceUpdateSchema = exports.provinceCreateSchema = exports.provinceListQuerySchema = exports.provinceIdParamSchema = void 0;
const zod_1 = require("zod");
exports.provinceIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().uuid({ message: 'id must be a valid UUID' }),
});
exports.provinceListQuerySchema = zod_1.z.object({
    region: zod_1.z.string().trim().min(2).max(120).optional(),
    search: zod_1.z.string().trim().min(1).max(120).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(500).optional(),
    offset: zod_1.z.coerce.number().int().min(0).optional(),
});
exports.provinceCreateSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid().nullable().optional(),
    name: zod_1.z.string().trim().min(2).max(150),
    code: zod_1.z.string().trim().min(2).max(64),
    region: zod_1.z.string().trim().min(2).max(150),
});
exports.provinceUpdateSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid().nullable().optional(),
    name: zod_1.z.string().trim().min(2).max(150).optional(),
    code: zod_1.z.string().trim().min(2).max(64).optional(),
    region: zod_1.z.string().trim().min(2).max(150).optional(),
}).refine((payload) => Object.values(payload).some((value) => value !== undefined), { message: 'At least one field must be provided for update' });
exports.provincesByRegionParamSchema = zod_1.z.object({
    region: zod_1.z.string().trim().min(2).max(150),
});
exports.locationSearchQuerySchema = zod_1.z.object({
    term: zod_1.z.string().trim().min(1).max(150),
    limit: zod_1.z.coerce.number().int().min(1).max(200).optional(),
});
exports.hierarchyQuerySchema = zod_1.z.object({
    province_id: zod_1.z.string().uuid().optional(),
});
