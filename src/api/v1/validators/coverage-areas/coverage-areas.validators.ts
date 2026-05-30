import { z } from 'zod';
import { CoverageAreaType, CoverageStatus } from '../../../../models/coverage_areas/types';

export const coverageAreaTypeSchema = z.enum(['city', 'municipality', 'barangay', 'district', 'province']);
export const coverageStatusSchema = z.enum(['active', 'inactive', 'archived']);

export const createCoverageAreaSchema = z.object({
  body: z.object({
    area_name: z.string().min(1, 'Area name is required'),
    area_type: coverageAreaTypeSchema,
    status: coverageStatusSchema.optional().default('active'),
    psgc_code: z.string().nullable().optional(),
    geometry: z.any().nullable().optional(),
    target_units: z.number().int().min(0).optional().default(0),
    target_donors: z.number().int().min(0).optional().default(0),
    collected_units: z.number().int().min(0).optional().default(0),
    donor_count: z.number().int().min(0).optional().default(0),
    successful_donations: z.number().int().min(0).optional().default(0),
    deferred_donors: z.number().int().min(0).optional().default(0),
    upcoming_events_count: z.number().int().min(0).optional().default(0),
    last_campaign_date: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
});

export const updateCoverageAreaSchema = z.object({
  body: z.object({
    area_name: z.string().min(1).optional(),
    area_type: coverageAreaTypeSchema.optional(),
    status: coverageStatusSchema.optional(),
    psgc_code: z.string().nullable().optional(),
    geometry: z.any().nullable().optional(),
    target_units: z.number().int().min(0).optional(),
    target_donors: z.number().int().min(0).optional(),
    collected_units: z.number().int().min(0).optional(),
    donor_count: z.number().int().min(0).optional(),
    successful_donations: z.number().int().min(0).optional(),
    deferred_donors: z.number().int().min(0).optional(),
    upcoming_events_count: z.number().int().min(0).optional(),
    last_campaign_date: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
});

export const listCoverageAreasQuerySchema = z.object({
  query: z.object({
    status: coverageStatusSchema.optional(),
    area_type: coverageAreaTypeSchema.optional(),
    search: z.string().optional(),
  }),
});
