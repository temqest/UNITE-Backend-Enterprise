import * as z from 'zod';

export const resendOtpSchema = z.object({
  email: z
    .string()
    .min(1, { message: 'Email is required' })
    .email({ message: 'Email must be a valid email address' })
    .toLowerCase(),
  authUserId: z
    .string()
    .min(1, { message: 'authUserId is required' }),
  firstName: z
    .string()
    .optional(),
});

export type ResendOtpInput = z.infer<typeof resendOtpSchema>;

export const validateResendOtp = (data: unknown): { data: ResendOtpInput; error: null } | { data: null; error: z.ZodError } => {
  const result = resendOtpSchema.safeParse(data);
  if (result.success) {
    return { data: result.data, error: null };
  }
  return { data: null, error: result.error };
};
