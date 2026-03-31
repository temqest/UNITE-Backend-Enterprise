import * as z from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, { message: 'Email is required' })
    .email({ message: 'Email must be a valid email address' })
    .toLowerCase(),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters' }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const validateLogin = (data: unknown): { data: LoginInput; error: null } | { data: null; error: z.ZodError } => {
  const result = loginSchema.safeParse(data);
  if (result.success) {
    return { data: result.data, error: null };
  }
  return { data: null, error: result.error };
};
