import type { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from '../../../../services/analytics/analytics.service';
import { AnalyticsDashboardQuerySchema } from '../../validators/analytics/analytics.validator';

const analyticsService = new AnalyticsService();

interface CacheEntry {
  data: any;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export class AnalyticsController {
  public async getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = (req as any).user?.org_id;
      if (!orgId) {
        res.status(401).json({ success: false, error: { message: 'Missing organization context' } });
        return;
      }

      const query = AnalyticsDashboardQuerySchema.parse(req.query);
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
    } catch (error) {
      next(error);
    }
  }
}
