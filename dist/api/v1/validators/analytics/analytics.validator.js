"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsDashboardQuerySchema = void 0;
const zod_1 = require("zod");
exports.AnalyticsDashboardQuerySchema = zod_1.z.object({
    from: zod_1.z.string().datetime().optional(),
    to: zod_1.z.string().datetime().optional(),
    date_range: zod_1.z.enum(['last_30_days', 'this_month', 'last_3_months', 'this_year', 'custom']).default('last_30_days').optional(),
    event_type: zod_1.z.string().optional(),
    coverage_area_id: zod_1.z.string().uuid().optional(),
    staff_id: zod_1.z.string().uuid().optional(),
    blood_type: zod_1.z.string().optional()
});
