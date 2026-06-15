import * as z from 'zod';

export const signupSchema = z.object({
  email: z
    .string()
    .email('Email must be a valid email address')
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters long'),
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name must not exceed 50 characters')
    .trim(),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must not exceed 50 characters')
    .trim(),
  organizationId: z
    .string()
    .uuid('Organization ID must be a valid UUID')
    .optional(),
  role: z
    .enum(['admin', 'staff', 'donor'])
    .optional()
    .default('staff'),
}).passthrough();

export type SignupInput = z.infer<typeof signupSchema>;

export const validateSignup = (data: unknown) => {
  try {
    const result = signupSchema.parse(data);
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
