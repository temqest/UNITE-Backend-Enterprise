import { z } from 'zod';

export const municipalityIdParamSchema = z.object({
  id: z.string().uuid({ message: 'id must be a valid UUID' }),
});

export const municipalitiesByDistrictParamSchema = z.object({
  districtId: z.string().uuid({ message: 'districtId must be a valid UUID' }),
});

export const municipalityListQuerySchema = z.object({
  province_id: z.string().uuid().optional(),
  district_id: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const municipalityCreateSchema = z.object({
  org_id: z.string().uuid().nullable().optional(),
  district_id: z.string().uuid(),
  province_id: z.string().uuid(),
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(64),
});

export const municipalityUpdateSchema = z.object({
  org_id: z.string().uuid().nullable().optional(),
  district_id: z.string().uuid().optional(),
  province_id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(150).optional(),
  code: z.string().trim().min(2).max(64).optional(),
}).refine(
  (payload) => Object.values(payload).some((value) => value !== undefined),
  { message: 'At least one field must be provided for update' }
);
