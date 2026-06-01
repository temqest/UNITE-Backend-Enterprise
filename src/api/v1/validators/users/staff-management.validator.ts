import * as z from 'zod';

const staffRoleSchema = z
  .string()
  .trim()
  .min(1, 'Role is required');

const sectorSchema = z.enum(['LGU', 'NON-LGU', 'Others', 'none']);

const optionalText = z
  .string()
  .trim()
  .optional();

export const userIdParamSchema = z.object({
  id: z.string().uuid('User ID must be a valid UUID'),
});

export const staffListQuerySchema = z.object({
  role: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
});

export const staffCreateSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(50),
  last_name: z.string().trim().min(1, 'Last name is required').max(50),
  email: z.string().email('Email must be a valid email address').toLowerCase().trim(),
  password: z.string().min(6, 'Password must be at least 6 characters long').max(128),
  role: staffRoleSchema,
  sector: sectorSchema,
  force_password_change: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  province: optionalText,
  district: optionalText,
  municipality: optionalText,
  geographic_designations: z.array(z.record(z.string(), z.any())).optional(),
});

export const staffUpdateSchema = z.object({
  first_name: z.string().trim().min(1).max(50).optional(),
  last_name: z.string().trim().min(1).max(50).optional(),
  email: z.string().email().toLowerCase().trim().optional(),
  role: staffRoleSchema.optional(),
  sector: sectorSchema.optional(),
  phone_number: optionalText,
  geographic_area: optionalText,
  geographic_designations: z.array(z.record(z.string(), z.any())).optional(),
  province: optionalText,
  district: optionalText,
  municipality: optionalText,
});

export type UserIdParamInput = z.infer<typeof userIdParamSchema>;
export type StaffListQueryInput = z.infer<typeof staffListQuerySchema>;
export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;

function formatZodError(error: z.ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

export const validateUserIdParam = (data: unknown) => {
  const result = userIdParamSchema.safeParse(data);
  if (result.success) return { success: true as const, data: result.data };
  return { success: false as const, error: formatZodError(result.error) };
};

export const validateStaffListQuery = (data: unknown) => {
  const result = staffListQuerySchema.safeParse(data);
  if (result.success) return { success: true as const, data: result.data };
  return { success: false as const, error: formatZodError(result.error) };
};

export const validateStaffCreate = (data: unknown) => {
  const result = staffCreateSchema.safeParse(data);
  if (result.success) return { success: true as const, data: result.data };
  return { success: false as const, error: formatZodError(result.error) };
};

export const validateStaffUpdate = (data: unknown) => {
  const result = staffUpdateSchema.safeParse(data);
  if (result.success) return { success: true as const, data: result.data };
  return { success: false as const, error: formatZodError(result.error) };
};
