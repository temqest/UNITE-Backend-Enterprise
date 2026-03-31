import { z } from 'zod';

export const districtIdParamSchema = z.object({
  id: z.string().uuid({ message: 'id must be a valid UUID' }),
});

export const districtsByProvinceParamSchema = z.object({
  provinceId: z.string().uuid({ message: 'provinceId must be a valid UUID' }),
});

export const districtListQuerySchema = z.object({
  province_id: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const districtCreateSchema = z.object({
  org_id: z.string().uuid().nullable().optional(),
  province_id: z.string().uuid(),
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(64),
});

export const districtUpdateSchema = z.object({
  org_id: z.string().uuid().nullable().optional(),
  province_id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(150).optional(),
  code: z.string().trim().min(2).max(64).optional(),
}).refine(
  (payload) => Object.values(payload).some((value) => value !== undefined),
  { message: 'At least one field must be provided for update' }
);
