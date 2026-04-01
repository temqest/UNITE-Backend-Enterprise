import { type Request, type Response } from 'express';
import { z } from 'zod';
import { supabaseServer } from '../../../../lib/supabase/supabase.client';
import { type BloodType, BLOOD_TYPES } from '../../../../models/inventory/types';
import { InventoryService } from '../../../../services/inventory/inventory.service';

interface AuthenticatedUser {
  id: string;
  org_id?: string;
  is_active?: boolean;
}

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

const inventoryService = new InventoryService(supabaseServer);

const dashboardQuerySchema = z.object({
  filter: z.enum(['all', 'low_stock', 'expiring_soon']).optional(),
  include_recent_transactions: z.coerce.number().int().min(1).max(100).optional(),
});

const transactionSchema = z.object({
  blood_type: z.enum(BLOOD_TYPES),
  transaction_type: z.enum(['add_stock', 'usage', 'wastage', 'adjustment']),
  direction: z.enum(['in', 'out']).optional(),
  quantity: z.coerce.number().int().min(1),
  min_threshold: z.coerce.number().int().min(0).optional(),
  location: z.string().trim().optional().nullable(),
  expiry_date: z.string().date().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  reference_type: z.string().trim().optional().nullable(),
  reference_id: z.string().uuid().optional().nullable(),
});

function sendError(res: Response, statusCode: number, error: ApiError): void {
  res.status(statusCode).json({ success: false, error });
}

function requireOrgUser(req: AuthenticatedRequest, res: Response): req is AuthenticatedRequest & { user: Required<AuthenticatedUser> } {
  if (!req.user?.id || !req.user.org_id || req.user.is_active === false) {
    sendError(res, 401, {
      code: 'UNAUTHORIZED',
      message: 'Active authenticated organization user required.',
    });
    return false;
  }

  return true;
}

export async function getInventoryDashboardController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireOrgUser(req, res)) {
    return;
  }

  const parsedQuery = dashboardQuerySchema.safeParse(req.query ?? {});
  if (!parsedQuery.success) {
    sendError(res, 400, {
      code: 'INVENTORY_FILTER_INVALID',
      message: 'Invalid dashboard query parameters.',
      details: parsedQuery.error.issues,
    });
    return;
  }

  const result = await inventoryService.getDashboard(req.user.org_id, {
    filter: parsedQuery.data.filter,
    include_recent_transactions: parsedQuery.data.include_recent_transactions,
  });

  if (result.error || !result.data) {
    sendError(res, 400, {
      code: result.error?.code ?? 'INVENTORY_DASHBOARD_FAILED',
      message: result.error?.message ?? 'Failed to load inventory dashboard.',
      details: result.error?.details,
    });
    return;
  }

  res.status(200).json({ success: true, data: result.data });
}

export async function getBloodTypeDetailController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireOrgUser(req, res)) {
    return;
  }

  const bloodType = req.params?.bloodType as BloodType | undefined;
  if (!bloodType || !BLOOD_TYPES.includes(bloodType)) {
    sendError(res, 400, {
      code: 'INVENTORY_BLOOD_TYPE_INVALID',
      message: 'bloodType must be one of O+, O-, A+, A-, B+, B-, AB+, AB-.',
    });
    return;
  }

  const result = await inventoryService.getBloodTypeDetail(req.user.org_id, bloodType);

  if (result.error || !result.data) {
    sendError(res, 400, {
      code: result.error?.code ?? 'INVENTORY_DETAIL_FAILED',
      message: result.error?.message ?? 'Failed to load blood type detail.',
      details: result.error?.details,
    });
    return;
  }

  res.status(200).json({ success: true, data: result.data });
}

export async function recordInventoryTransactionController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireOrgUser(req, res)) {
    return;
  }

  const parsed = transactionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendError(res, 400, {
      code: 'INVENTORY_TRANSACTION_INVALID',
      message: 'Invalid inventory transaction payload.',
      details: parsed.error.issues,
    });
    return;
  }

  const result = await inventoryService.recordTransaction({
    ...parsed.data,
    org_id: req.user.org_id,
    performed_by_user_id: req.user.id,
  });

  if (result.error || !result.data) {
    sendError(res, 400, {
      code: result.error?.code ?? 'INVENTORY_TRANSACTION_FAILED',
      message: result.error?.message ?? 'Failed to record inventory transaction.',
      details: result.error?.details,
    });
    return;
  }

  res.status(201).json({ success: true, data: result.data });
}
