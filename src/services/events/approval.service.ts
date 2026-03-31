import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventApprovalRow, EventRow, EventStatus } from '../../models/events/types';
import type { UserRow } from '../../models/users/types';
import type { ApprovalActionInput, EventActorContext, ReviewerCandidate, ServiceResult } from './event.types';
import {
  canTransitionEventStatus,
  hasPermission,
  hasRoleAtLeast,
  isGeoAreaMatch,
  toServiceError,
} from './event.types';

function getEventWorkflowScope(extraData: unknown): {
  geoScope: Record<string, unknown> | null;
} {
  const asRecord =
    extraData && typeof extraData === 'object' && !Array.isArray(extraData)
      ? (extraData as Record<string, unknown>)
      : {};

  const geoScopeRaw = asRecord.geo_scope;
  const geoScope =
    geoScopeRaw && typeof geoScopeRaw === 'object' && !Array.isArray(geoScopeRaw)
      ? (geoScopeRaw as Record<string, unknown>)
      : null;

  return { geoScope };
}

const ApprovalActionSchema = z
  .object({
    event_id: z.string().uuid(),
    action: z.enum(['accept', 'reject', 'reschedule']),
    notes: z.string().trim().optional().nullable(),
    proposed_event_date: z.string().date().optional(),
    proposed_start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional(),
    proposed_end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.action === 'reschedule') {
      if (!val.proposed_event_date || !val.proposed_start_time || !val.proposed_end_time) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Reschedule action requires proposed_event_date, proposed_start_time, and proposed_end_time.',
          path: ['action'],
        });
      }
    }
  });

export class EventApprovalService {
  constructor(private readonly supabase: SupabaseClient) {}

  private async getEvent(eventId: string): Promise<ServiceResult<EventRow>> {
    const { data, error } = await this.supabase.from('events').select('*').eq('id', eventId).single();

    if (error || !data) {
      return {
        data: null,
        error: toServiceError('EVENT_NOT_FOUND', 'Event was not found.', error),
      };
    }

    return { data: data as EventRow, error: null };
  }

  private async getLatestApproval(eventId: string): Promise<ServiceResult<EventApprovalRow | null>> {
    const { data, error } = await this.supabase
      .from('event_approvals')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        data: null,
        error: toServiceError('APPROVAL_LOOKUP_FAILED', 'Failed to fetch latest approval record.', error),
      };
    }

    return { data: (data as EventApprovalRow | null) ?? null, error: null };
  }

  private async createNotification(params: {
    org_id: string;
    user_id?: string | null;
    actor_user_id: string;
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  }): Promise<void> {
    await this.supabase.from('notifications').insert({
      org_id: params.org_id,
      user_id: params.user_id ?? null,
      created_by_user_id: params.actor_user_id,
      type: params.type,
      title: params.title,
      message: params.message,
      data: params.data ?? {},
      priority: params.priority ?? 'normal',
    });
  }

  private async createSystemLog(params: {
    org_id: string;
    user_id: string;
    action_type: string;
    entity_id: string;
    payload?: Record<string, unknown>;
    status?: string;
    notes?: string;
  }): Promise<void> {
    await this.supabase.from('system_logs').insert({
      org_id: params.org_id,
      user_id: params.user_id,
      category: 'events',
      action_type: params.action_type,
      entity_type: 'event',
      entity_id: params.entity_id,
      payload: params.payload ?? {},
      status: params.status ?? null,
      notes: params.notes ?? null,
    });
  }

  private getActionResultStatus(action: ApprovalActionInput['action']): EventStatus {
    if (action === 'accept') {
      return 'approved';
    }
    if (action === 'reject') {
      return 'rejected';
    }
    return 'rescheduled';
  }

  private canReview(actor: EventActorContext, event: EventRow): boolean {
    if (event.org_id !== actor.org_id) {
      return false;
    }

    const approverRole = hasRoleAtLeast(actor, 'coordinator');
    const approverPermission = hasPermission(actor, 'approve_events');

    if (!approverRole && !approverPermission) {
      return false;
    }

    const workflowScope = getEventWorkflowScope(event.extra_data);
    const eventGeoScope = workflowScope.geoScope;

    return isGeoAreaMatch(eventGeoScope, actor.geographic_area);
  }

  async getReviewersForEvent(eventId: string): Promise<ServiceResult<ReviewerCandidate[]>> {
    const eventResult = await this.getEvent(eventId);
    if (eventResult.error || !eventResult.data) {
      return { data: null, error: eventResult.error };
    }

    const event = eventResult.data;
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('org_id', event.org_id)
      .eq('is_active', true);

    if (error) {
      return {
        data: null,
        error: toServiceError('REVIEWER_LOOKUP_FAILED', 'Failed to fetch reviewer candidates.', error),
      };
    }

    const workflowScope = getEventWorkflowScope(event.extra_data);
    const eventGeoScope = workflowScope.geoScope;

    const reviewers = ((data as UserRow[]) ?? [])
      .filter((user) => {
        if (user.role.type === 'super_admin') {
          return true;
        }

        const permissions = user.role.permissions ?? [];
        const hasApprovePermission = permissions.includes('*') || permissions.includes('approve_events');
        const isCoordinator = user.role.type === 'coordinator' || user.role.type === 'admin';

        if (!hasApprovePermission && !isCoordinator) {
          return false;
        }

        const geoMatch = isGeoAreaMatch(eventGeoScope, user.geographic_area);

        return geoMatch;
      })
      .map((user) => ({
        ...user,
        reviewer_reason:
          user.role.type === 'super_admin'
            ? 'super_admin override'
            : 'matched role/permission and geographic area',
      }));

    return { data: reviewers, error: null };
  }

  private async insertApprovalRecord(params: {
    event: EventRow;
    actor: EventActorContext;
    action: 'accept' | 'reject' | 'reschedule';
    to_status: EventStatus;
    notes?: string | null;
    approval_level?: string;
    geo_scope?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.supabase.from('event_approvals').insert({
      org_id: params.event.org_id,
      event_id: params.event.id,
      acted_by_user_id: params.actor.id,
      action: params.action,
      from_status: params.event.status,
      to_status: params.to_status,
      approval_level: params.approval_level ?? params.actor.role.type,
      geo_scope: params.geo_scope ?? params.actor.geographic_area,
      notes: params.notes ?? null,
    });
  }

  private async updateEventFromApproval(
    event: EventRow,
    actionInput: z.infer<typeof ApprovalActionSchema>
  ): Promise<ServiceResult<EventRow>> {
    const targetStatus = this.getActionResultStatus(actionInput.action);

    if (!canTransitionEventStatus(event.status, targetStatus)) {
      return {
        data: null,
        error: toServiceError('INVALID_STATUS_TRANSITION', `Invalid status transition: ${event.status} -> ${targetStatus}.`),
      };
    }

    const patch: Record<string, unknown> = { status: targetStatus };

    if (actionInput.action === 'reschedule') {
      patch.event_date = actionInput.proposed_event_date;
      patch.start_time = actionInput.proposed_start_time;
      patch.end_time = actionInput.proposed_end_time;
    }

    const { data, error } = await this.supabase
      .from('events')
      .update(patch)
      .eq('id', event.id)
      .eq('org_id', event.org_id)
      .select('*')
      .single();

    if (error || !data) {
      return {
        data: null,
        error: toServiceError('EVENT_APPROVAL_UPDATE_FAILED', 'Failed to update event after approval action.', error),
      };
    }

    return { data: data as EventRow, error: null };
  }

  async requestApproval(
    actor: EventActorContext,
    eventId: string,
    notes?: string | null
  ): Promise<ServiceResult<EventRow>> {
    const eventResult = await this.getEvent(eventId);
    if (eventResult.error || !eventResult.data) {
      return { data: null, error: eventResult.error };
    }

    const event = eventResult.data;
    if (event.org_id !== actor.org_id) {
      return {
        data: null,
        error: toServiceError('PERMISSION_DENIED', 'Cannot request approval for an external organization event.'),
      };
    }

    const canRequest =
      event.requested_by_user_id === actor.id ||
      hasPermission(actor, 'request_event_approval') ||
      hasRoleAtLeast(actor, 'staff');

    if (!canRequest) {
      return {
        data: null,
        error: toServiceError('PERMISSION_DENIED', 'You do not have permission to request approval.'),
      };
    }

    const targetStatus: EventStatus = event.status === 'rescheduled' ? 'pending' : 'pending';

    if (!canTransitionEventStatus(event.status, targetStatus)) {
      return {
        data: null,
        error: toServiceError('INVALID_STATUS_TRANSITION', `Cannot request approval from ${event.status}.`),
      };
    }

    const { data, error } = await this.supabase
      .from('events')
      .update({ status: targetStatus })
      .eq('id', event.id)
      .eq('org_id', event.org_id)
      .select('*')
      .single();

    if (error || !data) {
      return {
        data: null,
        error: toServiceError('APPROVAL_REQUEST_FAILED', 'Failed to move event into review queue.', error),
      };
    }

    const updated = data as EventRow;

    await this.supabase.from('event_approvals').insert({
      org_id: updated.org_id,
      event_id: updated.id,
      acted_by_user_id: actor.id,
      action: 'request',
      from_status: event.status,
      to_status: updated.status,
      approval_level: actor.role.type,
      geo_scope: actor.geographic_area,
      notes: notes ?? 'Approval requested.',
    });

    await this.createSystemLog({
      org_id: updated.org_id,
      user_id: actor.id,
      action_type: 'event_updated',
      entity_id: updated.id,
      payload: {
        before_status: event.status,
        after_status: updated.status,
        action: 'request',
      },
      status: updated.status,
      notes: notes ?? 'Approval requested.',
    });

    return { data: updated, error: null };
  }

  async reviewApproval(actor: EventActorContext, input: ApprovalActionInput): Promise<ServiceResult<EventRow>> {
    try {
      const parsed = ApprovalActionSchema.parse(input);

      const eventResult = await this.getEvent(parsed.event_id);
      if (eventResult.error || !eventResult.data) {
        return { data: null, error: eventResult.error };
      }

      const event = eventResult.data;
      if (!this.canReview(actor, event)) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You are not allowed to review this event.'),
        };
      }

      if (!['requested', 'pending', 'rescheduled', 'approved'].includes(event.status)) {
        return {
          data: null,
          error: toServiceError('INVALID_STATUS_TRANSITION', `Cannot review an event currently in ${event.status} status.`),
        };
      }

      const latestApprovalResult = await this.getLatestApproval(event.id);
      if (latestApprovalResult.error) {
        return { data: null, error: latestApprovalResult.error };
      }

      const updateResult = await this.updateEventFromApproval(event, parsed);
      if (updateResult.error || !updateResult.data) {
        return { data: null, error: updateResult.error };
      }

      const updated = updateResult.data;

      await this.insertApprovalRecord({
        event,
        actor,
        action: parsed.action,
        to_status: updated.status,
        notes: parsed.notes ?? null,
        approval_level: actor.role.type,
      });

      await this.createNotification({
        org_id: updated.org_id,
        user_id: updated.requested_by_user_id,
        actor_user_id: actor.id,
        type: `event.${parsed.action}`,
        title:
          parsed.action === 'accept'
            ? 'Event approved'
            : parsed.action === 'reject'
              ? 'Event rejected'
              : 'Event rescheduled for review',
        message:
          parsed.action === 'accept'
            ? `${updated.title} has been approved.`
            : parsed.action === 'reject'
              ? `${updated.title} has been rejected.`
              : `${updated.title} needs another review cycle after reschedule.`,
        data: {
          event_id: updated.id,
          from_status: event.status,
          to_status: updated.status,
          previous_approval_id: latestApprovalResult.data?.id ?? null,
        },
        priority: parsed.action === 'reject' ? 'high' : 'normal',
      });

      await this.createSystemLog({
        org_id: updated.org_id,
        user_id: actor.id,
        action_type:
          parsed.action === 'accept'
            ? 'event_approved'
            : parsed.action === 'reject'
              ? 'event_rejected'
              : 'event_rescheduled',
        entity_id: updated.id,
        payload: {
          action: parsed.action,
          previous_status: event.status,
          current_status: updated.status,
          proposed_schedule:
            parsed.action === 'reschedule'
              ? {
                  event_date: parsed.proposed_event_date,
                  start_time: parsed.proposed_start_time,
                  end_time: parsed.proposed_end_time,
                }
              : null,
        },
        status: updated.status,
        notes: parsed.notes ?? undefined,
      });

      return { data: updated, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('APPROVAL_ACTION_INVALID', 'Invalid approval action payload.', error),
      };
    }
  }
}
