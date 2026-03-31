/**
 * =====================================================
 * SYSTEM LOGS - TypeScript Type Definitions
 * =====================================================
 * Multi-tenant audit trail for blood bank SaaS
 * Auto-synced with PostgreSQL schema
 */

/**
 * Category of system action for classification
 */
export type SystemLogCategory =
  | 'events'
  | 'users'
  | 'staff'
  | 'participants'
  | 'donations'
  | 'inventory'
  | 'system'
  | 'auth';

/**
 * Specific action types within each category
 */
export type SystemLogActionType =
  // Events
  | 'event_created'
  | 'event_updated'
  | 'event_deleted'
  | 'event_approved'
  | 'event_rejected'
  | 'event_rescheduled'
  | 'event_cancelled'
  // Participants
  | 'participant_joined'
  | 'participant_left'
  | 'participant_approved'
  | 'participant_rejected'
  // Staff
  | 'staff_signup'
  | 'staff_approved'
  | 'staff_rejected'
  | 'staff_removed'
  // Users
  | 'user_created'
  | 'user_updated'
  | 'user_deactivated'
  | 'user_reactivated'
  | 'role_changed'
  | 'permissions_updated'
  // Donations (future)
  | 'donation_recorded'
  | 'donation_updated'
  | 'donation_cancelled'
  // Inventory (future)
  | 'inventory_added'
  | 'inventory_removed'
  | 'inventory_transferred'
  // System
  | 'settings_updated'
  | 'bulk_import'
  | 'bulk_export'
  | 'data_purge'
  // Auth
  | 'login'
  | 'logout'
  | 'password_reset'
  | 'mfa_enabled'
  | 'mfa_disabled';

/**
 * Entity types that can be logged
 */
export type SystemLogEntityType =
  | 'event'
  | 'user'
  | 'participant'
  | 'donation'
  | 'inventory_item'
  | 'organization'
  | 'setting'
  | 'notification';

/**
 * Log status for approval workflows and outcomes
 */
export type SystemLogStatus =
  | 'approved'
  | 'rejected'
  | 'pending'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Base payload structure (flexible, extends based on action_type)
 */
export interface SystemLogPayload {
  before?: Record<string, any>;
  after?: Record<string, any>;
  reason?: string;
  metadata?: Record<string, any>;
  [key: string]: any; // Allow arbitrary fields
}

/**
 * Complete system log record (database row)
 */
export interface SystemLogRow {
  id: string; // UUID
  org_id: string; // UUID
  user_id: string | null; // UUID - null if user deleted
  category: SystemLogCategory;
  action_type: SystemLogActionType;
  entity_type: SystemLogEntityType | null;
  entity_id: string | null; // UUID
  payload: SystemLogPayload;
  notes: string | null;
  status: SystemLogStatus | null;
  ip_address: string | null; // INET stored as string
  user_agent: string | null;
  created_at: string; // ISO8601 timestamp
}

/**
 * Input for creating a system log (manual insertion via service)
 */
export interface SystemLogCreateInput {
  org_id: string;
  user_id: string | null;
  category: SystemLogCategory;
  action_type: SystemLogActionType;
  entity_type?: SystemLogEntityType | null;
  entity_id?: string | null;
  payload?: SystemLogPayload;
  notes?: string | null;
  status?: SystemLogStatus | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

/**
 * Filters for querying system logs
 */
export interface SystemLogQueryFilters {
  org_id: string; // Required for multi-tenancy
  user_id?: string;
  category?: SystemLogCategory;
  action_type?: SystemLogActionType;
  entity_type?: SystemLogEntityType;
  entity_id?: string;
  status?: SystemLogStatus;
  date_from?: string; // ISO8601
  date_to?: string; // ISO8601
  limit?: number;
  offset?: number;
  order_by?: 'created_at_asc' | 'created_at_desc';
}

/**
 * Response for log query with pagination
 */
export interface SystemLogQueryResponse {
  logs: SystemLogRow[];
  total_count: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

/**
 * Example payload interfaces for specific action types
 */

export interface EventApprovalPayload extends SystemLogPayload {
  before: { status: string };
  after: { status: string };
  event_name: string;
  reason?: string;
  approved_by?: string;
}

export interface EventReschedulePayload extends SystemLogPayload {
  old_date: string;
  new_date: string;
  old_location?: string;
  new_location?: string;
  reason: string;
}

export interface StaffApprovalPayload extends SystemLogPayload {
  user_id: string;
  role: string;
  approved_by: string;
  before?: { is_approved: boolean };
  after?: { is_approved: boolean };
}

export interface ParticipantJoinedPayload extends SystemLogPayload {
  event_id: string;
  user_id: string;
  status: string;
  registration_date?: string;
}

export interface RoleChangePayload extends SystemLogPayload {
  before: { role: string };
  after: { role: string };
  changed_by: string;
  reason?: string;
}

export interface DataPurgePayload extends SystemLogPayload {
  deleted_count: number;
  older_than_days: number;
  purged_by: string;
  purge_date: string;
}

/**
 * Function result type for create_system_log()
 */
export interface CreateSystemLogResult {
  log_id: string; // UUID of created log
}

/**
 * Function result type for purge_old_system_logs()
 */
export interface PurgeSystemLogsResult {
  deleted_count: number;
}
