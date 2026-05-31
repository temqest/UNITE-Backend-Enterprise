"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCoverageAreasQuerySchema = exports.updateCoverageAreaSchema = exports.createCoverageAreaSchema = exports.coverageStatusSchema = exports.coverageAreaTypeSchema = void 0;
const zod_1 = require("zod");
exports.coverageAreaTypeSchema = zod_1.z.enum(['city', 'municipality', 'barangay', 'district', 'province']);
exports.coverageStatusSchema = zod_1.z.enum(['active', 'inactive', 'archived']);
exports.createCoverageAreaSchema = zod_1.z.object({
    area_name: zod_1.z.string().min(1, 'Area name is required'),
    area_type: exports.coverageAreaTypeSchema,
    status: exports.coverageStatusSchema.optional().default('active'),
    psgc_code: zod_1.z.string().nullable().optional(),
    geometry: zod_1.z.any().nullable().optional(),
    province: zod_1.z.string().nullable().optional(),
    municipality: zod_1.z.string().nullable().optional(),
    barangay: zod_1.z.string().nullable().optional(),
    normalized_area_key: zod_1.z.string().nullable().optional(),
    target_units: zod_1.z.number().int().min(0).optional().default(0),
    target_donors: zod_1.z.number().int().min(0).optional().default(0),
    collected_units: zod_1.z.number().int().min(0).optional().default(0),
    donor_count: zod_1.z.number().int().min(0).optional().default(0),
    successful_donations: zod_1.z.number().int().min(0).optional().default(0),
    deferred_donors: zod_1.z.number().int().min(0).optional().default(0),
    upcoming_events_count: zod_1.z.number().int().min(0).optional().default(0),
    last_campaign_date: zod_1.z.string().nullable().optional(),
    notes: zod_1.z.string().nullable().optional(),
});
exports.updateCoverageAreaSchema = zod_1.z.object({
    area_name: zod_1.z.string().min(1).optional(),
    area_type: exports.coverageAreaTypeSchema.optional(),
    status: exports.coverageStatusSchema.optional(),
    psgc_code: zod_1.z.string().nullable().optional(),
    geometry: zod_1.z.any().nullable().optional(),
    province: zod_1.z.string().nullable().optional(),
    municipality: zod_1.z.string().nullable().optional(),
    barangay: zod_1.z.string().nullable().optional(),
    normalized_area_key: zod_1.z.string().nullable().optional(),
    target_units: zod_1.z.number().int().min(0).optional(),
    target_donors: zod_1.z.number().int().min(0).optional(),
    collected_units: zod_1.z.number().int().min(0).optional(),
    donor_count: zod_1.z.number().int().min(0).optional(),
    successful_donations: zod_1.z.number().int().min(0).optional(),
    deferred_donors: zod_1.z.number().int().min(0).optional(),
    upcoming_events_count: zod_1.z.number().int().min(0).optional(),
    last_campaign_date: zod_1.z.string().nullable().optional(),
    notes: zod_1.z.string().nullable().optional(),
});
exports.listCoverageAreasQuerySchema = zod_1.z.object({
    status: exports.coverageStatusSchema.optional(),
    area_type: exports.coverageAreaTypeSchema.optional(),
    search: zod_1.z.string().optional(),
});
