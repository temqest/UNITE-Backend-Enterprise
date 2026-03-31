import * as z from 'zod';

const passwordSchema = z
  .string()
  .min(8, { message: 'Password must be at least 8 characters' })
  .refine(
    (password) => /[A-Z]/.test(password),
    { message: 'Password must contain at least one uppercase letter' }
  )
  .refine(
    (password) => /[a-z]/.test(password),
    { message: 'Password must contain at least one lowercase letter' }
  )
  .refine(
    (password) => /\d/.test(password),
    { message: 'Password must contain at least one number' }
  )
  .refine(
    (password) => /[!@#$%^&*()_\-+=\[\]{};':"\\|,.<>\/?]/.test(password),
    { message: 'Password must contain at least one special character' }
  );

const baseSignupSchema = z.object({
  email: z
    .string()
    .min(1, { message: 'Email is required' })
    .email({ message: 'Email must be a valid email address' })
    .toLowerCase(),
  password: passwordSchema,
  first_name: z
    .string()
    .min(1, { message: 'First name is required' })
    .max(100, { message: 'First name must not exceed 100 characters' }),
  last_name: z
    .string()
    .min(1, { message: 'Last name is required' })
    .max(100, { message: 'Last name must not exceed 100 characters' }),
});

export const signupAdminSchema = baseSignupSchema.extend({
  variant: z.literal('admin').optional(),
  organization_name: z
    .string()
    .min(1, { message: 'Organization name is required' })
    .max(255, { message: 'Organization name must not exceed 255 characters' }),
});

export const signupStaffSchema = baseSignupSchema.extend({
  variant: z.literal('staff'),
  invitation_code: z
    .string()
    .min(1, { message: 'Invitation code is required' }),
});

export const signupSchema = z.union([signupAdminSchema, signupStaffSchema]);

export type SignupAdminInput = z.infer<typeof signupAdminSchema>;
export type SignupStaffInput = z.infer<typeof signupStaffSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

export const validateSignup = (data: unknown): { data: SignupInput; error: null } | { data: null; error: z.ZodError } => {
  const result = signupSchema.safeParse(data);
  if (result.success) {
    return { data: result.data, error: null };
  }
  return { data: null, error: result.error };
};
