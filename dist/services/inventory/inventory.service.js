"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryService = void 0;
const zod_1 = require("zod");
const types_1 = require("../../models/inventory/types");
const inventory_types_1 = require("./inventory.types");
const activity_log_service_1 = require("../activity-logs/activity-log.service");
const DashboardFilterSchema = zod_1.z.object({
    filter: zod_1.z.enum(['all', 'low_stock', 'expiring_soon']).optional(),
    include_recent_transactions: zod_1.z.number().int().min(1).max(100).optional(),
});
const RecordTransactionSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid(),
    performed_by_user_id: zod_1.z.string().uuid(),
    blood_type: zod_1.z.enum(types_1.BLOOD_TYPES),
    transaction_type: zod_1.z.enum(['add_stock', 'usage', 'wastage', 'adjustment']),
    direction: zod_1.z.enum(['in', 'out']).optional(),
    quantity: zod_1.z.number().int().min(1),
    min_threshold: zod_1.z.number().int().min(0).optional(),
    location: zod_1.z.string().trim().min(1).optional().nullable(),
    expiry_date: zod_1.z.string().date().optional().nullable(),
    notes: zod_1.z.string().trim().optional().nullable(),
    reference_type: zod_1.z.string().trim().optional().nullable(),
    reference_id: zod_1.z.string().uuid().optional().nullable(),
});
const RecordBatchTransactionSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid(),
    performed_by_user_id: zod_1.z.string().uuid(),
    reason: zod_1.z.string().trim().optional(),
    source: zod_1.z.string().trim().optional(),
    items: zod_1.z.array(zod_1.z.object({
        blood_type: zod_1.z.enum(types_1.BLOOD_TYPES),
        transaction_type: zod_1.z.enum(['add_stock', 'usage', 'wastage', 'adjustment']),
        direction: zod_1.z.enum(['in', 'out']).optional(),
        quantity: zod_1.z.number().int().min(1),
        min_threshold: zod_1.z.number().int().min(0).optional(),
        location: zod_1.z.string().trim().min(1).optional().nullable(),
        expiry_date: zod_1.z.string().date().optional().nullable(),
        notes: zod_1.z.string().trim().optional().nullable(),
    })),
});
const BASELINE_ROWS_TTL_MS = 10 * 60 * 1000;
const baselineRowsEnsuredAtByOrg = new Map();
function deriveStatus(currentStock, minThreshold) {
    if (currentStock <= 0) {
        return 'critical';
    }
    if (currentStock < minThreshold) {
        return currentStock <= Math.max(1, Math.floor(minThreshold * 0.5)) ? 'critical' : 'low';
    }
    return 'safe';
}
function normalizeLocation(location) {
    if (typeof location !== 'string') {
        return null;
    }
    const trimmed = location.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function daysUntil(dateString) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(`${dateString}T00:00:00.000Z`);
    if (Number.isNaN(target.getTime())) {
        return Number.MAX_SAFE_INTEGER;
    }
    const diffMs = target.getTime() - today.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
class InventoryService {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
    }
    async ensureBaselineRows(orgId) {
        const lastEnsuredAt = baselineRowsEnsuredAtByOrg.get(orgId);
        if (lastEnsuredAt && Date.now() - lastEnsuredAt < BASELINE_ROWS_TTL_MS) {
            return;
        }
        const inventoryTable = this.supabase.from('blood_inventory');
        const { data, error } = await inventoryTable
            .select('blood_type')
            .eq('org_id', orgId)
            .is('location', null)
            .is('expiry_date', null);
        if (error) {
            return;
        }
        const existing = new Set((data ?? []).map((row) => String(row.blood_type)));
        const missingRows = types_1.BLOOD_TYPES
            .filter((bloodType) => !existing.has(bloodType))
            .map((bloodType) => ({
            org_id: orgId,
            blood_type: bloodType,
            quantity: 0,
            min_threshold: 50,
            location: null,
            expiry_date: null,
        }));
        if (missingRows.length > 0) {
            await inventoryTable.insert(missingRows);
        }
        const now = Date.now();
        if (baselineRowsEnsuredAtByOrg.size > 100) {
            for (const [k, timestamp] of baselineRowsEnsuredAtByOrg.entries()) {
                if (now - timestamp > BASELINE_ROWS_TTL_MS) {
                    baselineRowsEnsuredAtByOrg.delete(k);
                }
            }
        }
        baselineRowsEnsuredAtByOrg.set(orgId, now);
    }
    toCard(bloodType, rows) {
        const currentStock = rows.reduce((sum, row) => sum + Math.max(0, row.quantity ?? 0), 0);
        const minThreshold = rows.reduce((max, row) => Math.max(max, row.min_threshold ?? 0), 0) || 50;
        const fillRatio = minThreshold > 0 ? Math.min(100, Math.round((currentStock / minThreshold) * 100)) : 100;
        const status = deriveStatus(currentStock, minThreshold);
        let lastUpdated = null;
        for (const row of rows) {
            if (!row.updated_at) {
                continue;
            }
            if (!lastUpdated || row.updated_at > lastUpdated) {
                lastUpdated = row.updated_at;
            }
        }
        return {
            blood_type: bloodType,
            current_stock: currentStock,
            min_threshold: minThreshold,
            fill_ratio: fillRatio,
            status,
            last_updated: lastUpdated,
        };
    }
    async getDashboard(orgId, filterInput = {}) {
        const parsedFilter = DashboardFilterSchema.safeParse(filterInput);
        if (!parsedFilter.success) {
            return {
                data: null,
                error: (0, inventory_types_1.toInventoryError)('INVENTORY_FILTER_INVALID', 'Invalid inventory dashboard filter.', parsedFilter.error.issues),
            };
        }
        await this.ensureBaselineRows(orgId);
        const inventoryTable = this.supabase.from('blood_inventory');
        const transactionsTable = this.supabase.from('blood_inventory_transactions');
        const [inventoryResult, transactionsResult] = await Promise.all([
            inventoryTable.select('*').eq('org_id', orgId),
            transactionsTable
                .select('*')
                .eq('org_id', orgId)
                .order('created_at', { ascending: false })
                .limit(parsedFilter.data.include_recent_transactions ?? 15),
        ]);
        if (inventoryResult.error) {
            return {
                data: null,
                error: (0, inventory_types_1.toInventoryError)('INVENTORY_FETCH_FAILED', 'Failed to load blood inventory.', inventoryResult.error),
            };
        }
        if (transactionsResult.error) {
            return {
                data: null,
                error: (0, inventory_types_1.toInventoryError)('INVENTORY_TRANSACTIONS_FETCH_FAILED', 'Failed to load inventory transactions.', transactionsResult.error),
            };
        }
        const inventoryRows = (inventoryResult.data ?? []);
        const transactions = (transactionsResult.data ?? []);
        const rowsByType = new Map();
        for (const bloodType of types_1.BLOOD_TYPES) {
            rowsByType.set(bloodType, []);
        }
        for (const row of inventoryRows) {
            if (!rowsByType.has(row.blood_type)) {
                continue;
            }
            rowsByType.get(row.blood_type)?.push(row);
        }
        const cards = types_1.BLOOD_TYPES.map((bloodType) => this.toCard(bloodType, rowsByType.get(bloodType) ?? []));
        const now = new Date();
        const soon7 = new Date(now);
        soon7.setDate(soon7.getDate() + 7);
        const soon30 = new Date(now);
        soon30.setDate(soon30.getDate() + 30);
        const nowIso = now.toISOString().slice(0, 10);
        const soon7Iso = soon7.toISOString().slice(0, 10);
        const soon30Iso = soon30.toISOString().slice(0, 10);
        const expiringSoon = inventoryRows
            .filter((row) => row.quantity > 0 && !!row.expiry_date && row.expiry_date >= nowIso && row.expiry_date <= soon30Iso)
            .map((row) => ({
            blood_type: row.blood_type,
            quantity: row.quantity,
            expiry_date: row.expiry_date,
            location: row.location,
            days_until_expiry: daysUntil(row.expiry_date),
        }))
            .sort((a, b) => a.days_until_expiry - b.days_until_expiry || b.quantity - a.quantity)
            .slice(0, 20);
        const cardsView = parsedFilter.data.filter === 'low_stock'
            ? cards.filter((card) => card.status === 'low' || card.status === 'critical')
            : parsedFilter.data.filter === 'expiring_soon'
                ? cards.filter((card) => expiringSoon.some((item) => item.blood_type === card.blood_type))
                : cards;
        const totalBags = cards.reduce((sum, card) => sum + card.current_stock, 0);
        const totalCriticalItems = cards.filter((card) => card.status === 'critical').length;
        const expiringNext7Days = inventoryRows
            .filter((row) => row.quantity > 0 && !!row.expiry_date && row.expiry_date >= nowIso && row.expiry_date <= soon7Iso)
            .reduce((sum, row) => sum + row.quantity, 0);
        const lastUpdated = inventoryRows.reduce((latest, row) => {
            if (!row.updated_at) {
                return latest;
            }
            if (!latest || row.updated_at > latest) {
                return row.updated_at;
            }
            return latest;
        }, null);
        return {
            data: {
                summary: {
                    total_bags: totalBags,
                    total_critical_items: totalCriticalItems,
                    expiring_next_7_days: expiringNext7Days,
                    last_updated: lastUpdated,
                },
                blood_type_cards: cardsView,
                low_stock_alerts: cards.filter((card) => card.status === 'low' || card.status === 'critical'),
                expiring_soon: expiringSoon,
                recent_transactions: transactions,
            },
            error: null,
        };
    }
    async getBloodTypeDetail(orgId, bloodType) {
        await this.ensureBaselineRows(orgId);
        const inventoryTable = this.supabase.from('blood_inventory');
        const transactionsTable = this.supabase.from('blood_inventory_transactions');
        const [inventoryResult, historyResult] = await Promise.all([
            inventoryTable
                .select('*')
                .eq('org_id', orgId)
                .eq('blood_type', bloodType)
                .order('expiry_date', { ascending: true, nullsFirst: false }),
            transactionsTable
                .select('*')
                .eq('org_id', orgId)
                .eq('blood_type', bloodType)
                .order('created_at', { ascending: false })
                .limit(30),
        ]);
        if (inventoryResult.error) {
            return {
                data: null,
                error: (0, inventory_types_1.toInventoryError)('INVENTORY_DETAIL_FETCH_FAILED', 'Failed to load blood type detail.', inventoryResult.error),
            };
        }
        if (historyResult.error) {
            return {
                data: null,
                error: (0, inventory_types_1.toInventoryError)('INVENTORY_HISTORY_FETCH_FAILED', 'Failed to load blood type history.', historyResult.error),
            };
        }
        const rows = (inventoryResult.data ?? []);
        const card = this.toCard(bloodType, rows);
        const byLocationMap = new Map();
        for (const row of rows) {
            const location = row.location?.trim() || 'Unspecified';
            byLocationMap.set(location, (byLocationMap.get(location) ?? 0) + Math.max(0, row.quantity));
        }
        const byLocation = Array.from(byLocationMap.entries())
            .map(([location, quantity]) => ({ location, quantity }))
            .sort((a, b) => b.quantity - a.quantity);
        const expiryDistribution = rows
            .filter((row) => row.quantity > 0 && !!row.expiry_date)
            .map((row) => ({
            expiry_date: row.expiry_date,
            quantity: row.quantity,
            days_until_expiry: daysUntil(row.expiry_date),
        }))
            .sort((a, b) => a.days_until_expiry - b.days_until_expiry || b.quantity - a.quantity);
        return {
            data: {
                blood_type: bloodType,
                summary: card,
                by_location: byLocation,
                expiry_distribution: expiryDistribution,
                history: (historyResult.data ?? []),
            },
            error: null,
        };
    }
    async recordTransaction(input) {
        const parsed = RecordTransactionSchema.safeParse(input);
        if (!parsed.success) {
            return {
                data: null,
                error: (0, inventory_types_1.toInventoryError)('INVENTORY_TRANSACTION_INVALID', 'Invalid inventory transaction payload.', parsed.error.issues),
            };
        }
        const payload = parsed.data;
        const inventoryTable = this.supabase.from('blood_inventory');
        const transactionsTable = this.supabase.from('blood_inventory_transactions');
        const normalizedLocation = normalizeLocation(payload.location);
        const direction = payload.transaction_type === 'add_stock' ? 'in' : (payload.direction ?? 'out');
        if (direction === 'in') {
            let batchQuery = inventoryTable
                .select('*')
                .eq('org_id', payload.org_id)
                .eq('blood_type', payload.blood_type);
            batchQuery = normalizedLocation ? batchQuery.eq('location', normalizedLocation) : batchQuery.is('location', null);
            batchQuery = payload.expiry_date ? batchQuery.eq('expiry_date', payload.expiry_date) : batchQuery.is('expiry_date', null);
            const existingBatch = await batchQuery.maybeSingle();
            if (existingBatch.error && existingBatch.error.code !== 'PGRST116') {
                return {
                    data: null,
                    error: (0, inventory_types_1.toInventoryError)('INVENTORY_BATCH_LOOKUP_FAILED', 'Unable to find inventory batch for add stock.', existingBatch.error),
                };
            }
            if (existingBatch.data) {
                const updatedQuantity = Math.max(0, Number(existingBatch.data.quantity ?? 0) + payload.quantity);
                const updatePayload = {
                    quantity: updatedQuantity,
                };
                if (typeof payload.min_threshold === 'number') {
                    updatePayload.min_threshold = payload.min_threshold;
                }
                const { error: updateError } = await inventoryTable
                    .update(updatePayload)
                    .eq('id', existingBatch.data.id)
                    .eq('org_id', payload.org_id);
                if (updateError) {
                    return {
                        data: null,
                        error: (0, inventory_types_1.toInventoryError)('INVENTORY_BATCH_UPDATE_FAILED', 'Unable to add stock to existing batch.', updateError),
                    };
                }
            }
            else {
                const { error: insertError } = await inventoryTable.insert({
                    org_id: payload.org_id,
                    blood_type: payload.blood_type,
                    quantity: payload.quantity,
                    min_threshold: payload.min_threshold ?? 50,
                    location: normalizedLocation,
                    expiry_date: payload.expiry_date ?? null,
                });
                if (insertError) {
                    return {
                        data: null,
                        error: (0, inventory_types_1.toInventoryError)('INVENTORY_BATCH_INSERT_FAILED', 'Unable to create inventory batch.', insertError),
                    };
                }
            }
        }
        else {
            let rowsQuery = inventoryTable
                .select('*')
                .eq('org_id', payload.org_id)
                .eq('blood_type', payload.blood_type)
                .gt('quantity', 0);
            if (normalizedLocation) {
                rowsQuery = rowsQuery.eq('location', normalizedLocation);
            }
            const { data: candidateRows, error: stockLookupError } = await rowsQuery;
            if (stockLookupError) {
                return {
                    data: null,
                    error: (0, inventory_types_1.toInventoryError)('INVENTORY_STOCK_LOOKUP_FAILED', 'Unable to fetch current stock for deduction.', stockLookupError),
                };
            }
            const sortedRows = (candidateRows ?? [])
                .slice()
                .sort((a, b) => {
                const aExpiry = a.expiry_date ?? '9999-12-31';
                const bExpiry = b.expiry_date ?? '9999-12-31';
                return aExpiry.localeCompare(bExpiry);
            });
            const available = sortedRows.reduce((sum, row) => sum + Math.max(0, row.quantity), 0);
            if (available < payload.quantity) {
                return {
                    data: null,
                    error: (0, inventory_types_1.toInventoryError)('INVENTORY_INSUFFICIENT_STOCK', `Insufficient stock for ${payload.blood_type}. Requested ${payload.quantity}, available ${available}.`),
                };
            }
            let remaining = payload.quantity;
            for (const row of sortedRows) {
                if (remaining <= 0) {
                    break;
                }
                const deduct = Math.min(remaining, row.quantity);
                const nextQuantity = row.quantity - deduct;
                const { error: updateError } = await inventoryTable
                    .update({ quantity: nextQuantity })
                    .eq('id', row.id)
                    .eq('org_id', payload.org_id);
                if (updateError) {
                    return {
                        data: null,
                        error: (0, inventory_types_1.toInventoryError)('INVENTORY_STOCK_DEDUCTION_FAILED', 'Unable to deduct inventory stock.', updateError),
                    };
                }
                remaining -= deduct;
            }
        }
        const { data: transactionRow, error: transactionError } = await transactionsTable
            .insert({
            org_id: payload.org_id,
            blood_type: payload.blood_type,
            transaction_type: payload.transaction_type,
            direction,
            quantity: payload.quantity,
            location: normalizedLocation,
            expiry_date: payload.expiry_date ?? null,
            notes: payload.notes ?? null,
            reference_type: payload.reference_type ?? null,
            reference_id: payload.reference_id ?? null,
            performed_by_user_id: payload.performed_by_user_id,
        })
            .select('*')
            .single();
        if (transactionError || !transactionRow) {
            return {
                data: null,
                error: (0, inventory_types_1.toInventoryError)('INVENTORY_TRANSACTION_WRITE_FAILED', 'Inventory updated but transaction logging failed.', transactionError),
            };
        }
        activity_log_service_1.ActivityLogService.recordActivityLog({
            orgId: payload.org_id,
            actorUserId: payload.performed_by_user_id,
            action: 'inventory.transaction_created',
            entityType: 'inventory',
            entityId: transactionRow.id,
            entityLabel: `${payload.quantity} units of ${payload.blood_type}`,
            description: `Recorded inventory transaction: ${payload.transaction_type} of ${payload.quantity} units of ${payload.blood_type}.`,
            metadata: {
                transaction_type: payload.transaction_type,
                blood_type: payload.blood_type,
                quantity: payload.quantity,
                direction,
            },
        });
        return {
            data: transactionRow,
            error: null,
        };
    }
    async recordBatchTransactions(payload) {
        const parsed = RecordBatchTransactionSchema.safeParse(payload);
        if (!parsed.success) {
            return {
                data: null,
                error: (0, inventory_types_1.toInventoryError)('INVENTORY_BATCH_TRANSACTION_INVALID', 'Invalid inventory batch transaction payload.', parsed.error.issues),
            };
        }
        const { items, org_id, performed_by_user_id, reason, source } = parsed.data;
        const errors = [];
        let successCount = 0;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const transactionPayload = {
                org_id,
                performed_by_user_id,
                blood_type: item.blood_type,
                transaction_type: item.transaction_type,
                direction: item.direction,
                quantity: item.quantity,
                min_threshold: item.min_threshold,
                location: item.location,
                expiry_date: item.expiry_date,
                notes: item.notes || reason || undefined,
                reference_type: source || undefined,
            };
            const result = await this.recordTransaction(transactionPayload);
            if (result.error) {
                errors.push({
                    index: i,
                    code: result.error.code,
                    message: result.error.message,
                });
            }
            else {
                successCount++;
            }
        }
        if (successCount === 0 && items.length > 0) {
            return {
                data: null,
                error: (0, inventory_types_1.toInventoryError)('INVENTORY_BATCH_TRANSACTION_FAILED', 'All items in the batch failed to process.', errors),
            };
        }
        return {
            data: {
                success_count: successCount,
                error_count: errors.length,
                errors,
            },
            error: null,
        };
    }
    async getTransactions(orgId, query) {
        const page = Math.max(1, query.page ?? 1);
        const limit = Math.max(1, Math.min(100, query.limit ?? 10));
        const transactionsTable = this.supabase.from('blood_inventory_transactions');
        let dbQuery = transactionsTable
            .select('*', { count: 'exact' })
            .eq('org_id', orgId);
        if (query.date) {
            const nextDate = new Date(query.date);
            if (!isNaN(nextDate.getTime())) {
                nextDate.setUTCDate(nextDate.getUTCDate() + 1);
                const nextDateStr = nextDate.toISOString().slice(0, 10);
                dbQuery = dbQuery
                    .gte('created_at', `${query.date}T00:00:00.000Z`)
                    .lt('created_at', `${nextDateStr}T00:00:00.000Z`);
            }
        }
        const from = (page - 1) * limit;
        const to = page * limit - 1;
        const { data, error, count } = await dbQuery
            .order('created_at', { ascending: false })
            .range(from, to);
        if (error) {
            return {
                data: null,
                error: (0, inventory_types_1.toInventoryError)('INVENTORY_TRANSACTIONS_FETCH_FAILED', 'Failed to load inventory transactions.', error),
            };
        }
        return {
            data: {
                items: (data ?? []),
                total: count ?? 0,
                page,
                limit,
            },
            error: null,
        };
    }
}
exports.InventoryService = InventoryService;
