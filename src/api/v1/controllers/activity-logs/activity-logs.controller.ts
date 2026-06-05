import { Request, Response } from 'express';
import { ActivityLogService } from '../../../../services/activity-logs/activity-log.service';

export const getActivityLogs = async (req: Request, res: Response) => {
  const { org_id } = (req as any).user!;
  
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 20;
  
  const filters = {
    orgId: org_id!,
    action: req.query.action as string,
    entityType: req.query.entity_type as string,
    actorUserId: req.query.actor_user_id as string,
    dateFrom: req.query.date_from as string,
    dateTo: req.query.date_to as string,
    page,
    limit,
  };

  const result = await ActivityLogService.queryLogs(filters);

  res.status(200).json({
    success: true,
    data: result,
  });
};
