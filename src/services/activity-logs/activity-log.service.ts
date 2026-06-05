import { supabaseServer as supabase } from '../../lib/supabase/supabase.client';

export interface ActivityLogCreateInput {
  orgId: string;
  actorUserId?: string;
  actorName?: string;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityLabel?: string;
  description: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface ActivityLogQueryFilters {
  orgId: string;
  action?: string;
  entityType?: string;
  actorUserId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export class ActivityLogService {
  /**
   * Records an activity log.
   * This method uses fire-and-forget or fails silently so it doesn't break the main request flow.
   */
  static async recordActivityLog(input: ActivityLogCreateInput): Promise<void> {
    try {
      // Remove undefined values to prevent insertion issues
      const cleanMetadata = input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : {};

      const payload = {
        org_id: input.orgId,
        actor_user_id: input.actorUserId || null,
        actor_name: input.actorName || null,
        actor_email: input.actorEmail || null,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId || null,
        entity_label: input.entityLabel || null,
        description: input.description,
        metadata: cleanMetadata,
        ip_address: input.ipAddress || null,
        user_agent: input.userAgent || null,
      };

      // We do not await this heavily or throw if it fails
      supabase.from('organization_activity_logs').insert(payload).then(({ error }) => {
        if (error) {
          console.error('[ActivityLogService] Failed to record activity log asynchronously:', error.message);
        }
      });
    } catch (err) {
      console.error('[ActivityLogService] Exception in recordActivityLog:', err);
    }
  }

  static async queryLogs(filters: ActivityLogQueryFilters) {
    const limit = filters.limit || 50;
    const page = filters.page || 1;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('organization_activity_logs')
      .select('*', { count: 'exact' })
      .eq('org_id', filters.orgId);

    if (filters.action) {
      query = query.eq('action', filters.action);
    }
    if (filters.entityType) {
      query = query.eq('entity_type', filters.entityType);
    }
    if (filters.actorUserId) {
      query = query.eq('actor_user_id', filters.actorUserId);
    }
    if (filters.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    return {
      logs: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0,
    };
  }
}
