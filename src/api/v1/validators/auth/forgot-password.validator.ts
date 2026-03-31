import * as z from 'zod';

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, { message: 'Email is required' })
    .email({ message: 'Email must be a valid email address' })
    .toLowerCase(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const validateForgotPassword = (
  data: unknown
): { data: ForgotPasswordInput; error: null } | { data: null; error: z.ZodError } => {
  const result = forgotPasswordSchema.safeParse(data);
  if (result.success) {
    return { data: result.data, error: null };
  }
  return { data: null, error: result.error };
};
