export const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as const;

export type BloodType = (typeof BLOOD_TYPES)[number];

export type InventoryTransactionType = 'add_stock' | 'usage' | 'wastage' | 'adjustment';
export type InventoryTransactionDirection = 'in' | 'out';

export interface BloodInventoryRow {
  id: string;
  org_id: string;
  blood_type: BloodType;
  quantity: number;
  min_threshold: number;
  expiry_date: string | null;
  location: string | null;
  last_updated: string;
  created_at: string;
  updated_at: string;
}

export interface BloodInventoryTransactionRow {
  id: string;
  org_id: string;
  blood_type: BloodType;
  transaction_type: InventoryTransactionType;
  direction: InventoryTransactionDirection;
  quantity: number;
  location: string | null;
  expiry_date: string | null;
  notes: string | null;
  reference_type: string | null;
  reference_id: string | null;
  performed_by_user_id: string | null;
  created_at: string;
}

export interface RecordInventoryTransactionInput {
  org_id: string;
  blood_type: BloodType;
  transaction_type: InventoryTransactionType;
  quantity: number;
  min_threshold?: number;
  location?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  performed_by_user_id?: string | null;
}
