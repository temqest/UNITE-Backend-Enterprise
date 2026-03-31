import * as z from 'zod';

export const profileUpdateSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name must not be empty')
    .max(50, 'First name must not exceed 50 characters')
    .trim()
    .optional(),
  lastName: z
    .string()
    .min(1, 'Last name must not be empty')
    .max(50, 'Last name must not exceed 50 characters')
    .trim()
    .optional(),
  geographicArea: z
    .string()
    .max(100, 'Geographic area must not exceed 100 characters')
    .trim()
    .optional()
    .nullable(),
  role: z
    .enum(['admin', 'staff'])
    .optional(),
}).refine(
  (data) => {
    const hasAtLeastOneField = Object.values(data).some((value) => value !== undefined && value !== null);
    return hasAtLeastOneField;
  },
  { message: 'At least one field must be provided for update' }
);

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const validateProfileUpdate = (data: unknown) => {
  try {
    const result = profileUpdateSchema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedError = error.issues.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return { success: false, error: formattedError };
    }
    return { success: false, error: 'Validation failed' };
  }
};
