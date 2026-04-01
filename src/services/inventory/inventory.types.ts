import type { BloodType, BloodInventoryTransactionRow, InventoryTransactionDirection, InventoryTransactionType } from '../../models/inventory/types';

export type InventoryHealthStatus = 'safe' | 'low' | 'critical';

export interface InventoryServiceError {
  code: string;
  message: string;
  details?: unknown;
}

export interface InventoryServiceResult<T> {
  data: T | null;
  error: InventoryServiceError | null;
}

export interface BloodTypeInventoryCard {
  blood_type: BloodType;
  current_stock: number;
  min_threshold: number;
  fill_ratio: number;
  status: InventoryHealthStatus;
  last_updated: string | null;
}

export interface InventorySummaryStats {
  total_bags: number;
  total_critical_items: number;
  expiring_next_7_days: number;
  last_updated: string | null;
}

export interface ExpiringSoonItem {
  blood_type: BloodType;
  quantity: number;
  expiry_date: string;
  location: string | null;
  days_until_expiry: number;
}

export interface InventoryDashboardData {
  summary: InventorySummaryStats;
  blood_type_cards: BloodTypeInventoryCard[];
  low_stock_alerts: BloodTypeInventoryCard[];
  expiring_soon: ExpiringSoonItem[];
  recent_transactions: BloodInventoryTransactionRow[];
}

export interface InventoryDashboardFilter {
  filter?: 'all' | 'low_stock' | 'expiring_soon';
  include_recent_transactions?: number;
}

export interface RecordInventoryTransactionInput {
  org_id: string;
  performed_by_user_id: string;
  blood_type: BloodType;
  transaction_type: InventoryTransactionType;
  direction?: InventoryTransactionDirection;
  quantity: number;
  min_threshold?: number;
  location?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
}

export interface BloodTypeInventoryDetail {
  blood_type: BloodType;
  summary: BloodTypeInventoryCard;
  by_location: Array<{ location: string; quantity: number }>;
  expiry_distribution: Array<{ expiry_date: string; quantity: number; days_until_expiry: number }>;
  history: BloodInventoryTransactionRow[];
}

export function toInventoryError(code: string, message: string, details?: unknown): InventoryServiceError {
  return { code, message, details };
}
