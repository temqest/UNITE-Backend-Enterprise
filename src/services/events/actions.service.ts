import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventRow } from '../../models/events/types';
import type { EventActionAvailability, EventActorContext, EventAvailableAction, ServiceResult } from './event.types';
import {
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

export class EventActionsService {
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

  async getAvailableActions(actor: EventActorContext, eventId: string): Promise<ServiceResult<EventActionAvailability>> {
    const eventResult = await this.getEvent(eventId);
    if (eventResult.error || !eventResult.data) {
      return { data: null, error: eventResult.error };
    }

    const event = eventResult.data;
    const actions = new Set<EventAvailableAction>();

    const sameOrg = event.org_id === actor.org_id;
    const isRequester = event.requested_by_user_id === actor.id;
    const isAdminLike = hasRoleAtLeast(actor, 'admin') || hasPermission(actor, 'manage_events');

    if (!sameOrg && !event.is_public) {
      return {
        data: {
          event_id: event.id,
          status: event.status,
          actions: [],
        },
        error: null,
      };
    }

    if (sameOrg) {
      actions.add('view_private');
    }

    const workflowScope = getEventWorkflowScope(event.extra_data);
    const eventGeoScope = workflowScope.geoScope;
    const scopeMatch = isGeoAreaMatch(eventGeoScope, actor.geographic_area);

    const canRequest =
      sameOrg &&
      (isRequester || hasPermission(actor, 'request_event_approval') || hasRoleAtLeast(actor, 'staff'));

    if (canRequest && ['requested', 'rescheduled'].includes(event.status)) {
      actions.add('request_approval');
    }

    const canReview =
      sameOrg &&
      scopeMatch &&
      (hasPermission(actor, 'approve_events') || hasRoleAtLeast(actor, 'coordinator'));

    if (canReview && ['requested', 'pending', 'rescheduled', 'approved'].includes(event.status)) {
      actions.add('approve_event');
      actions.add('reject_event');
      actions.add('reschedule_event');
    }

    if (sameOrg && (isAdminLike || isRequester || hasPermission(actor, 'edit_events'))) {
      actions.add('edit_event');
    }

    if (sameOrg && event.status === 'approved' && (canReview || isAdminLike)) {
      actions.add('cancel_published_event');
      actions.add('reschedule_published_event');
    }

    if (sameOrg && (hasPermission(actor, 'assign_event_staff') || hasRoleAtLeast(actor, 'coordinator'))) {
      actions.add('assign_staff');
      actions.add('remove_staff');
    }

    if (sameOrg && hasRoleAtLeast(actor, 'staff')) {
      actions.add('apply_as_staff');
    }

    if (event.is_public || sameOrg) {
      actions.add('apply_as_donor');
    }

    if (sameOrg && (hasPermission(actor, 'manage_event_participants') || hasRoleAtLeast(actor, 'coordinator'))) {
      actions.add('confirm_participant');
      actions.add('mark_participated');
      actions.add('mark_donated');
    }

    return {
      data: {
        event_id: event.id,
        status: event.status,
        actions: Array.from(actions),
      },
      error: null,
    };
  }
}
