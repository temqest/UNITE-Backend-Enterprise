"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsController = void 0;
const analytics_service_1 = require("../../../../services/analytics/analytics.service");
const analytics_validator_1 = require("../../validators/analytics/analytics.validator");
const analyticsService = new analytics_service_1.AnalyticsService();
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds
class AnalyticsController {
    async getDashboard(req, res, next) {
        try {
            const orgId = req.user?.org_id;
            if (!orgId) {
                res.status(401).json({ success: false, error: { message: 'Missing organization context' } });
                return;
            }
            const query = analytics_validator_1.AnalyticsDashboardQuerySchema.parse(req.query);
            const isRefresh = req.query.forceRefresh === 'true' || req.query.refresh === 'true';
            const cacheKey = `org:${orgId}:analytics:${JSON.stringify(query)}`;
            if (!isRefresh) {
                const cached = cache.get(cacheKey);
                if (cached && cached.expiresAt > Date.now()) {
                    res.status(200).json({
                        success: true,
                        data: cached.data
                    });
                    return;
                }
            }
            const dashboard = await analyticsService.getDashboard(orgId, query);
            cache.set(cacheKey, {
                data: dashboard,
                expiresAt: Date.now() + CACHE_TTL_MS
            });
            res.status(200).json({
                success: true,
                data: dashboard
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.AnalyticsController = AnalyticsController;
