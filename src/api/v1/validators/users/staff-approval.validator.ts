import * as z from 'zod';

export const staffApprovalSchema = z.object({
  userId: z
    .string()
    .uuid('User ID must be a valid UUID'),
  status: z
    .enum(['approve', 'reject']),
  roleType: z
    .string()
    .trim()
    .min(1, 'Role type cannot be empty')
    .max(64, 'Role type must not exceed 64 characters')
    .optional()
    .nullable(),
  sector: z
    .enum(['LGU', 'NON-LGU', 'Others', 'none'])
    .optional()
    .nullable(),
  reason: z
    .string()
    .max(500, 'Reason must not exceed 500 characters')
    .trim()
    .optional()
    .nullable(),
});

export type StaffApprovalInput = z.infer<typeof staffApprovalSchema>;

export const validateStaffApproval = (data: unknown) => {
  try {
    const result = staffApprovalSchema.parse(data);
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
