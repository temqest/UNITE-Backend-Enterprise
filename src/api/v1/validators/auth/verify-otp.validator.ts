import * as z from 'zod';

export const verifyOtpSchema = z.object({
  email: z
    .string()
    .min(1, { message: 'Email is required' })
    .email({ message: 'Email must be a valid email address' })
    .toLowerCase(),
  code: z
    .string()
    .length(6, { message: 'Code must be exactly 6 digits' })
    .regex(/^\d{6}$/, { message: 'Code must contain only digits' }),
  authUserId: z
    .string()
    .min(1, { message: 'authUserId is required' })
    .uuid({ message: 'authUserId must be a valid UUID' }),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const validateVerifyOtp = (data: unknown): { data: VerifyOtpInput; error: null } | { data: null; error: z.ZodError } => {
  const result = verifyOtpSchema.safeParse(data);
  if (result.success) {
    return { data: result.data, error: null };
  }
  return { data: null, error: result.error };
};
