import * as z from 'zod';

export const lookupOrganizationCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'Organization code must be at least 3 characters')
    .max(32, 'Organization code must not exceed 32 characters')
    .regex(/^[A-Z0-9_-]+$/, 'Only letters, numbers, underscore, and dash are allowed'),
});

export type LookupOrganizationCodeInput = z.infer<typeof lookupOrganizationCodeSchema>;

export const validateLookupOrganizationCode = (
  data: unknown
): { data: LookupOrganizationCodeInput; error: null } | { data: null; error: z.ZodError } => {
  const result = lookupOrganizationCodeSchema.safeParse(data);
  if (result.success) {
    return { data: result.data, error: null };
  }
  return { data: null, error: result.error };
};

