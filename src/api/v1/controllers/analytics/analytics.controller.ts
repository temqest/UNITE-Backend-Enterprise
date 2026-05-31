import type { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from '../../../../services/analytics/analytics.service';
import { AnalyticsDashboardQuerySchema } from '../../validators/analytics/analytics.validator';

const analyticsService = new AnalyticsService();

export class AnalyticsController {
  public async getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.org_id;
      if (!orgId) {
        res.status(401).json({ success: false, error: { message: 'Missing organization context' } });
        return;
      }

      const query = AnalyticsDashboardQuerySchema.parse(req.query);
      const dashboard = await analyticsService.getDashboard(orgId, query);

      res.status(200).json({
        success: true,
        data: dashboard
      });
    } catch (error) {
      next(error);
    }
  }
}
