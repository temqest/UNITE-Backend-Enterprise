import type { SupabaseClient } from '@supabase/supabase-js';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type NotificationType =
  | 'new_review_needed'
  | 'event_accepted'
  | 'event_rejected'
  | 'event_rescheduled'
  | 'event_canceled'
  | 'signup_approval_needed'
  | 'broadcast';

export interface ServiceError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ServiceResult<T> {
  data: T | null;
  error: ServiceError | null;
}

export interface NotificationPayload {
  org_id: string;
  user_id?: string | null;
  created_by_user_id?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  priority?: NotificationPriority;
  send_email?: boolean;
  dedupe_window_minutes?: number;
}

export interface BroadcastNotificationPayload {
  org_id: string;
  created_by_user_id?: string | null;
  type?: Extract<NotificationType, 'broadcast'>;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  priority?: NotificationPriority;
  target_user_ids?: string[];
  target_role_types?: string[];
  send_email?: boolean;
}

export interface NotificationRecord {
  id: string;
  org_id: string;
  user_id: string | null;
  created_by_user_id: string | null;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  priority: NotificationPriority;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserNotificationPreferences {
  enable_all: boolean;
  enable_in_app: boolean;
  enable_email: boolean;
  raw: Record<string, unknown>;
}

export interface EmailDetails {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface QueueDecision {
  allowed: boolean;
  queued: boolean;
  merged: boolean;
  reason?: string;
  aggregate_count?: number;
}

export interface QueueJob {
  id: string;
  org_id: string;
  user_id: string;
  type: NotificationType;
  created_at: number;
  run_after: number;
  payload: NotificationPayload;
  attempts: number;
  max_attempts: number;
}

export interface QueueFlushResult {
  processed: number;
  succeeded: number;
  failed: number;
  remaining: number;
}

export interface ListNotificationsInput {
  org_id: string;
  user_id: string;
  include_read?: boolean;
  include_broadcast?: boolean;
  types?: NotificationType[];
  limit?: number;
  offset?: number;
}

export interface ListNotificationsResult {
  items: NotificationRecord[];
  count: number;
  has_more: boolean;
  limit: number;
  offset: number;
}

export interface NotificationDispatchContext {
  supabase: SupabaseClient;
  onSend: (job: QueueJob) => Promise<void>;
}

export interface TriggerEventStatusPayload {
  org_id: string;
  target_user_id: string;
  actor_user_id: string;
  type: Extract<NotificationType, 'event_accepted' | 'event_rejected' | 'event_rescheduled' | 'event_canceled'>;
  event_id: string;
  event_name: string;
  notes?: string;
  when?: string;
}

export interface TriggerReviewNeededPayload {
  org_id: string;
  reviewer_user_id: string;
  actor_user_id: string;
  event_id: string;
  event_name: string;
}

export interface TriggerSignupApprovalPayload {
  org_id: string;
  approver_user_id: string;
  pending_user_id: string;
  pending_user_name: string;
  actor_user_id?: string;
}
