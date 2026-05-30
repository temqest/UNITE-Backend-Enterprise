import { Router } from 'express';
import {
  getBloodTypeDetailController,
  getInventoryDashboardController,
  recordInventoryTransactionController,
  batchUpdateInventoryController,
  getInventoryTransactionsController,
} from '../../controllers/inventory/inventory.controller';
import { authMiddleware } from '../../../../middelware/auth.middleware';
import { authorize, requireActiveUser, requireOrgScope } from '../../../../middelware/authorization.middleware';
import { asyncHandler } from '../../../../lib/async-handler';

const inventoryRouter = Router();

inventoryRouter.get(
  '/dashboard',
  authMiddleware,
  requireActiveUser,
  requireOrgScope,
  authorize('inventory.read'),
  asyncHandler(getInventoryDashboardController as any)
);

inventoryRouter.get(
  '/blood-types/:bloodType',
  authMiddleware,
  requireActiveUser,
  requireOrgScope,
  authorize('inventory.read'),
  asyncHandler(getBloodTypeDetailController as any)
);

inventoryRouter.post(
  '/transactions',
  authMiddleware,
  requireActiveUser,
  requireOrgScope,
  authorize('inventory.update'),
  asyncHandler(recordInventoryTransactionController as any)
);

inventoryRouter.post(
  '/batch-update',
  authMiddleware,
  requireActiveUser,
  requireOrgScope,
  authorize('inventory.update'),
  asyncHandler(batchUpdateInventoryController as any)
);

inventoryRouter.get(
  '/transactions',
  authMiddleware,
  requireActiveUser,
  requireOrgScope,
  authorize('inventory.read'),
  asyncHandler(getInventoryTransactionsController as any)
);

export { inventoryRouter };
export default inventoryRouter;
