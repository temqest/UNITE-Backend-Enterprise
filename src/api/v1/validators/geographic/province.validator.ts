import { z } from 'zod';

export const provinceIdParamSchema = z.object({
  id: z.string().uuid({ message: 'id must be a valid UUID' }),
});

export const provinceListQuerySchema = z.object({
  region: z.string().trim().min(2).max(120).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const provinceCreateSchema = z.object({
  org_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(64),
  region: z.string().trim().min(2).max(150),
});

export const provinceUpdateSchema = z.object({
  org_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(150).optional(),
  code: z.string().trim().min(2).max(64).optional(),
  region: z.string().trim().min(2).max(150).optional(),
}).refine(
  (payload) => Object.values(payload).some((value) => value !== undefined),
  { message: 'At least one field must be provided for update' }
);

export const provincesByRegionParamSchema = z.object({
  region: z.string().trim().min(2).max(150),
});

export const locationSearchQuerySchema = z.object({
  term: z.string().trim().min(1).max(150),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const hierarchyQuerySchema = z.object({
  province_id: z.string().uuid().optional(),
});
