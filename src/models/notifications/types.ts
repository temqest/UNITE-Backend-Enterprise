// notifications/types.ts
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface NotificationRow {
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

export interface NotificationCreateInput {
  org_id: string;
  user_id?: string | null;
  created_by_user_id?: string | null;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  priority?: NotificationPriority;
  is_read?: boolean;
  read_at?: string | null;
}

export interface NotificationUpdateInput {
  is_read: boolean;
  read_at?: string | null;
}
