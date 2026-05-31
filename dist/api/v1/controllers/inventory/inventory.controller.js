"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInventoryDashboardController = getInventoryDashboardController;
exports.getBloodTypeDetailController = getBloodTypeDetailController;
exports.recordInventoryTransactionController = recordInventoryTransactionController;
exports.batchUpdateInventoryController = batchUpdateInventoryController;
exports.getInventoryTransactionsController = getInventoryTransactionsController;
const zod_1 = require("zod");
const supabase_client_1 = require("../../../../lib/supabase/supabase.client");
const types_1 = require("../../../../models/inventory/types");
const inventory_service_1 = require("../../../../services/inventory/inventory.service");
const inventoryService = new inventory_service_1.InventoryService(supabase_client_1.supabaseServer);
const dashboardQuerySchema = zod_1.z.object({
    filter: zod_1.z.enum(['all', 'low_stock', 'expiring_soon']).optional(),
    include_recent_transactions: zod_1.z.coerce.number().int().min(1).max(100).optional(),
});
const transactionSchema = zod_1.z.object({
    blood_type: zod_1.z.enum(types_1.BLOOD_TYPES),
    transaction_type: zod_1.z.enum(['add_stock', 'usage', 'wastage', 'adjustment']),
    direction: zod_1.z.enum(['in', 'out']).optional(),
    quantity: zod_1.z.coerce.number().int().min(1),
    min_threshold: zod_1.z.coerce.number().int().min(0).optional(),
    location: zod_1.z.string().trim().optional().nullable(),
    expiry_date: zod_1.z.string().date().optional().nullable(),
    notes: zod_1.z.string().trim().optional().nullable(),
    reference_type: zod_1.z.string().trim().optional().nullable(),
    reference_id: zod_1.z.string().uuid().optional().nullable(),
});
function sendError(res, statusCode, error) {
    res.status(statusCode).json({ success: false, error });
}
function requireOrgUser(req, res) {
    if (!req.user?.id || !req.user.org_id || req.user.is_active === false) {
        sendError(res, 401, {
            code: 'UNAUTHORIZED',
            message: 'Active authenticated organization user required.',
        });
        return false;
    }
    return true;
}
async function getInventoryDashboardController(req, res) {
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
async function getBloodTypeDetailController(req, res) {
    if (!requireOrgUser(req, res)) {
        return;
    }
    const bloodType = req.params?.bloodType;
    if (!bloodType || !types_1.BLOOD_TYPES.includes(bloodType)) {
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
async function recordInventoryTransactionController(req, res) {
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
async function batchUpdateInventoryController(req, res) {
    if (!requireOrgUser(req, res)) {
        return;
    }
    // Basic validation before passing to service
    if (!req.body || !Array.isArray(req.body.items) || req.body.items.length === 0) {
        sendError(res, 400, {
            code: 'INVENTORY_BATCH_TRANSACTION_INVALID',
            message: 'Payload must include an items array.',
        });
        return;
    }
    const result = await inventoryService.recordBatchTransactions({
        org_id: req.user.org_id,
        performed_by_user_id: req.user.id,
        reason: req.body.reason,
        source: req.body.source,
        items: req.body.items,
    });
    if (result.error || !result.data) {
        sendError(res, 400, {
            code: result.error?.code ?? 'INVENTORY_BATCH_TRANSACTION_FAILED',
            message: result.error?.message ?? 'Failed to process inventory batch transaction.',
            details: result.error?.details,
        });
        return;
    }
    res.status(201).json({ success: true, data: result.data });
}
const transactionsQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional(),
    date: zod_1.z.string().trim().optional(),
});
async function getInventoryTransactionsController(req, res) {
    if (!requireOrgUser(req, res)) {
        return;
    }
    const parsedQuery = transactionsQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
        sendError(res, 400, {
            code: 'INVENTORY_TRANSACTIONS_QUERY_INVALID',
            message: 'Invalid transactions query parameters.',
            details: parsedQuery.error.issues,
        });
        return;
    }
    const result = await inventoryService.getTransactions(req.user.org_id, {
        page: parsedQuery.data.page,
        limit: parsedQuery.data.limit,
        date: parsedQuery.data.date,
    });
    if (result.error || !result.data) {
        sendError(res, 400, {
            code: result.error?.code ?? 'INVENTORY_TRANSACTIONS_FETCH_FAILED',
            message: result.error?.message ?? 'Failed to load inventory transactions.',
            details: result.error?.details,
        });
        return;
    }
    res.status(200).json({ success: true, data: result.data });
}
