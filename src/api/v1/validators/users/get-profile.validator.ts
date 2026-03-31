import * as z from 'zod';

export const getProfileSchema = z.object({
  userId: z
    .string()
    .uuid('User ID must be a valid UUID')
    .optional(),
});

export type GetProfileInput = z.infer<typeof getProfileSchema>;

export const validateGetProfile = (data: unknown) => {
  try {
    const result = getProfileSchema.parse(data);
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
