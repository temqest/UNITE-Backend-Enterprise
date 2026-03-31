import * as z from 'zod';

export const changePasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters' })
    .max(128, { message: 'Password must not exceed 128 characters' }),
  confirmPassword: z
    .string()
    .min(8, { message: 'Confirm password must be at least 8 characters' })
    .max(128, { message: 'Confirm password must not exceed 128 characters' }),
}).refine((value) => value.newPassword === value.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const validateChangePassword = (
  data: unknown
): { data: ChangePasswordInput; error: null } | { data: null; error: z.ZodError } => {
  const result = changePasswordSchema.safeParse(data);
  if (result.success) {
    return { data: result.data, error: null };
  }
  return { data: null, error: result.error };
};
