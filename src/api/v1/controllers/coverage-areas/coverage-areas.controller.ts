import { Request, Response } from 'express';
import { coverageAreasService } from '../../../../services/coverage-areas/coverage-areas.service';

export const listCoverageAreas = async (req: Request, res: Response) => {
  const orgId = req.activeUser!.org_id;
  const { status, area_type, search } = req.query;

  const data = await coverageAreasService.listCoverageAreas(orgId, {
    status: status as string,
    area_type: area_type as string,
    search: search as string,
  });

  res.json({ success: true, data });
};

export const getCoverageArea = async (req: Request, res: Response) => {
  const orgId = req.activeUser!.org_id;
  const id = req.params.id;

  const data = await coverageAreasService.getCoverageArea(id, orgId);

  res.json({ success: true, data });
};

export const createCoverageArea = async (req: Request, res: Response) => {
  const orgId = req.activeUser!.org_id;
  const userId = req.activeUser!.id;

  const data = await coverageAreasService.createCoverageArea(orgId, userId, req.body);

  res.status(201).json({ success: true, data });
};

export const updateCoverageArea = async (req: Request, res: Response) => {
  const orgId = req.activeUser!.org_id;
  const userId = req.activeUser!.id;
  const id = req.params.id;

  const data = await coverageAreasService.updateCoverageArea(id, orgId, userId, req.body);

  res.json({ success: true, data });
};

export const deleteCoverageArea = async (req: Request, res: Response) => {
  const orgId = req.activeUser!.org_id;
  const id = req.params.id;

  await coverageAreasService.deleteCoverageArea(id, orgId);

  res.json({ success: true });
};
