import { z } from 'zod';

export const AnalyticsDashboardQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  date_range: z.enum(['last_30_days', 'this_month', 'last_3_months', 'this_year', 'custom']).default('last_30_days').optional(),
  event_type: z.string().optional(),
  coverage_area_id: z.string().uuid().optional(),
  staff_id: z.string().uuid().optional(),
  blood_type: z.string().optional()
});

export type AnalyticsDashboardQuery = z.infer<typeof AnalyticsDashboardQuerySchema>;
