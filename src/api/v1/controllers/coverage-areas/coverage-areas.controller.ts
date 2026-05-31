import { Request, Response } from 'express';
import { coverageAreasService } from '../../../../services/coverage-areas/coverage-areas.service';

export const listCoverageAreas = async (req: Request, res: Response) => {
  const orgId = (req as any).user!.org_id;
  const { status, area_type, search } = req.query;

  const data = await coverageAreasService.listCoverageAreas(orgId, {
    status: status as string,
    area_type: area_type as string,
    search: search as string,
  });

  res.json({ success: true, data });
};

export const getCoverageArea = async (req: Request, res: Response) => {
  const orgId = (req as any).user!.org_id;
  const id = req.params.id as string;

  const data = await coverageAreasService.getCoverageArea(id, orgId);

  res.json({ success: true, data });
};

export const createCoverageArea = async (req: Request, res: Response) => {
  const orgId = (req as any).user!.org_id;
  const userId = (req as any).user!.id;

  const data = await coverageAreasService.createCoverageArea(orgId, userId, req.body);

  res.status(201).json({ success: true, data });
};

export const updateCoverageArea = async (req: Request, res: Response) => {
  const orgId = (req as any).user!.org_id;
  const userId = (req as any).user!.id;
  const id = req.params.id as string;

  const data = await coverageAreasService.updateCoverageArea(id, orgId, userId, req.body);

  res.json({ success: true, data });
};

export const deleteCoverageArea = async (req: Request, res: Response) => {
  const orgId = (req as any).user!.org_id;
  const id = req.params.id as string;

  await coverageAreasService.deleteCoverageArea(id, orgId);

  res.json({ success: true });
};

export const reconcileEvents = async (req: Request, res: Response) => {
  const orgId = (req as any).user!.org_id;
  const id = req.params.id as string;

  const coverageArea = await coverageAreasService.getCoverageArea(id, orgId);
  const matchedCount = await coverageAreasService.reconcileEventsForCoverageArea(orgId, coverageArea);
  const data = await coverageAreasService.getCoverageArea(id, orgId); // refetch with new aggregations

  res.json({ success: true, matchedCount, data });
};
