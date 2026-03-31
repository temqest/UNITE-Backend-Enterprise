import * as z from 'zod';

export const settingsUpdateSchema = z.object({
  enableEmail: z
    .boolean()
    .optional(),
  enableInApp: z
    .boolean()
    .optional(),
  enableSms: z
    .boolean()
    .optional(),
  enablePushNotifications: z
    .boolean()
    .optional(),
  enableEventNotifications: z
    .boolean()
    .optional(),
  enableOrgUpdates: z
    .boolean()
    .optional(),
  emailDigestFrequency: z
    .enum(['daily', 'weekly', 'monthly', 'never'])
    .optional(),
  timezone: z
    .string()
    .max(100, 'Timezone must not exceed 100 characters')
    .optional(),
  language: z
    .string()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Language must be a valid ISO 639-1 code (e.g., "en" or "en-US")')
    .optional(),
}).refine(
  (data) => {
    const hasAtLeastOneField = Object.values(data).some((value) => value !== undefined);
    return hasAtLeastOneField;
  },
  { message: 'At least one setting must be provided for update' }
);

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

export const validateSettingsUpdate = (data: unknown) => {
  try {
    const result = settingsUpdateSchema.parse(data);
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
