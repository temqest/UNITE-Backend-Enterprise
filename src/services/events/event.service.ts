import { z } from 'zod';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type {
  EventCreateInput,
  EventRow,
  EventStatus,
  EventUpdateInput,
} from '../../models/events/types';
import type { OrganizationSettingsRow } from '../../models/organization_settings/types';
import type { UserRow } from '../../models/users/types';
import type {
  EventActorContext,
  EventFilter,
  EventSubscriptionHandlers,
  PublicEventFilter,
  ServiceResult,
} from './event.types';
import {
  buildEventSearchText,
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

const EventCreateSchema = z.object({
  org_id: z.string().uuid(),
  title: z.string().trim().min(3),
  address: z.string().trim().min(1),
  type: z.enum(['blood_drive', 'training', 'advocacy', 'assembly']),
  event_date: z.string().date(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
  description: z.string().trim().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  extra_data: z.record(z.string(), z.unknown()),
  status: z.enum(['requested', 'pending', 'approved', 'rejected', 'rescheduled']).optional(),
  requested_by_user_id: z.string().uuid().optional().nullable(),
  is_public: z.boolean().optional(),
});

const EventUpdateSchema = z.object({
  title: z.string().trim().min(3).optional(),
  address: z.string().trim().min(1).optional(),
  type: z.enum(['blood_drive', 'training', 'advocacy', 'assembly']).optional(),
  event_date: z.string().date().optional(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional(),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional(),
  description: z.string().trim().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  extra_data: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['requested', 'pending', 'approved', 'rejected', 'rescheduled']).optional(),
  is_public: z.boolean().optional(),
});

const EventFilterSchema = z.object({
  org_id: z.string().uuid().optional(),
  statuses: z.array(z.enum(['requested', 'pending', 'approved', 'rejected', 'rescheduled'])).optional(),
  types: z.array(z.enum(['blood_drive', 'training', 'advocacy', 'assembly'])).optional(),
  from_date: z.string().date().optional(),
  to_date: z.string().date().optional(),
  requested_by_user_id: z.string().uuid().optional(),
  include_public: z.boolean().optional(),
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

const PublicEventFilterSchema = z.object({
  from_date: z.string().date().optional(),
  to_date: z.string().date().optional(),
  types: z.array(z.enum(['blood_drive', 'training', 'advocacy', 'assembly'])).optional(),
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

export class EventService {
  constructor(private readonly supabase: SupabaseClient) {}

  private async withRequester(events: EventRow[]): Promise<ServiceResult<EventRow[]>> {
    const requesterIds = Array.from(
      new Set(events.map((event) => event.requested_by_user_id).filter((id): id is string => typeof id === 'string' && id.length > 0))
    );

    if (requesterIds.length === 0) {
      return {
        data: events.map((event) => ({ ...event, requested_by: null })),
        error: null,
      };
    }

    const { data, error } = await this.supabase
      .from('users')
      .select('id, first_name, last_name')
      .in('id', requesterIds);

    if (error) {
      return {
        data: null,
        error: toServiceError('EVENT_REQUESTER_LOOKUP_FAILED', 'Failed to fetch event requester details.', error),
      };
    }

    const requesterMap = new Map<string, { id: string; first_name: string; last_name: string; full_name: string }>();
    for (const row of (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>) {
      const first = String(row.first_name ?? '').trim();
      const last = String(row.last_name ?? '').trim();
      requesterMap.set(row.id, {
        id: row.id,
        first_name: first,
        last_name: last,
        full_name: [first, last].filter(Boolean).join(' ').trim() || 'Unknown requester',
      });
    }

    return {
      data: events.map((event) => ({
        ...event,
        requested_by: event.requested_by_user_id ? requesterMap.get(event.requested_by_user_id) ?? null : null,
      })),
      error: null,
    };
  }

  private async withLatestApproval(events: EventRow[]): Promise<ServiceResult<EventRow[]>> {
    const eventIds = Array.from(new Set(events.map((event) => event.id).filter(Boolean)));

    if (eventIds.length === 0) {
      return { data: events, error: null };
    }

    const { data, error } = await this.supabase
      .from('event_approvals')
      .select('event_id, action, acted_by_user_id, to_status, notes, created_at')
      .in('event_id', eventIds)
      .order('created_at', { ascending: false });

    if (error) {
      return {
        data: null,
        error: toServiceError('EVENT_LATEST_APPROVAL_LOOKUP_FAILED', 'Failed to fetch latest approval details.', error),
      };
    }

    const latestByEventId = new Map<string, {
      action: EventRow['latest_approval'] extends infer T
        ? T extends { action: infer A }
          ? A
          : never
        : never;
      acted_by_user_id: string | null;
      to_status: EventStatus;
      notes: string | null;
      created_at: string;
    }>();

    for (const row of (data ?? []) as Array<{
      event_id: string;
      action: 'request' | 'accept' | 'reject' | 'reschedule' | 'auto_approve';
      acted_by_user_id: string | null;
      to_status: EventStatus;
      notes: string | null;
      created_at: string;
    }>) {
      if (!latestByEventId.has(row.event_id)) {
        latestByEventId.set(row.event_id, {
          action: row.action,
          acted_by_user_id: row.acted_by_user_id,
          to_status: row.to_status,
          notes: row.notes,
          created_at: row.created_at,
        });
      }
    }

    return {
      data: events.map((event) => ({
        ...event,
        latest_approval: latestByEventId.get(event.id) ?? null,
      })),
      error: null,
    };
  }

  private async enrichEvents(events: EventRow[]): Promise<ServiceResult<EventRow[]>> {
    const withRequester = await this.withRequester(events);
    if (withRequester.error || !withRequester.data) {
      return { data: null, error: withRequester.error };
    }

    const withLatestApproval = await this.withLatestApproval(withRequester.data);
    if (withLatestApproval.error || !withLatestApproval.data) {
      return { data: null, error: withLatestApproval.error };
    }

    return { data: withLatestApproval.data, error: null };
  }

  private async getOrganizationSettings(orgId: string): Promise<ServiceResult<OrganizationSettingsRow | null>> {
    const { data, error } = await this.supabase
      .from('organization_settings')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) {
      return {
        data: null,
        error: toServiceError('ORG_SETTINGS_LOOKUP_FAILED', 'Failed to fetch organization settings.', error),
      };
    }

    return { data: (data as OrganizationSettingsRow | null) ?? null, error: null };
  }

  private async getActorById(userId: string): Promise<ServiceResult<UserRow>> {
    const { data, error } = await this.supabase.from('users').select('*').eq('id', userId).single();

    if (error || !data) {
      return {
        data: null,
        error: toServiceError('ACTOR_NOT_FOUND', 'Requesting user was not found.', error),
      };
    }

    return { data: data as UserRow, error: null };
  }

  async getEventById(eventId: string, actor?: EventActorContext): Promise<ServiceResult<EventRow>> {
    const { data, error } = await this.supabase.from('events').select('*').eq('id', eventId).single();

    if (error || !data) {
      return {
        data: null,
        error: toServiceError('EVENT_NOT_FOUND', 'Event was not found.', error),
      };
    }

    const event = data as EventRow;

    if (!actor) {
      if (!event.is_public || event.status !== 'approved') {
        return {
          data: null,
          error: toServiceError('EVENT_NOT_VISIBLE', 'Event is not publicly visible.'),
        };
      }
      const enriched = await this.enrichEvents([event]);
      if (enriched.error || !enriched.data?.[0]) {
        return { data: null, error: enriched.error };
      }
      return { data: enriched.data[0], error: null };
    }

    const isSameOrg = event.org_id === actor.org_id;
    const canViewOrgEvents = hasRoleAtLeast(actor, 'staff') || hasPermission(actor, 'view_events');

    if (!isSameOrg && !event.is_public) {
      return {
        data: null,
        error: toServiceError('EVENT_NOT_VISIBLE', 'Event is outside your organization scope.'),
      };
    }

    if (isSameOrg && !canViewOrgEvents && event.requested_by_user_id !== actor.id && !event.is_public) {
      return {
        data: null,
        error: toServiceError('PERMISSION_DENIED', 'You do not have permission to view this event.'),
      };
    }

    const workflowScope = getEventWorkflowScope(event.extra_data);
    if (isSameOrg && !isGeoAreaMatch(actor.geographic_area, workflowScope.geoScope)) {
      if (!hasRoleAtLeast(actor, 'admin')) {
        return {
          data: null,
          error: toServiceError('EVENT_NOT_VISIBLE', 'Event is outside your geographic area.'),
        };
      }
    }

    const enriched = await this.enrichEvents([event]);
    if (enriched.error || !enriched.data?.[0]) {
      return { data: null, error: enriched.error };
    }

    return { data: enriched.data[0], error: null };
  }

  private parseTimeToMinutes(timeValue: string): number {
    const [h, m] = timeValue.split(':');
    return Number(h) * 60 + Number(m);
  }

  private async validateCreationAgainstSettings(
    payload: Pick<EventCreateInput, 'org_id' | 'event_date' | 'start_time' | 'end_time'>,
    settings: OrganizationSettingsRow | null
  ): Promise<ServiceResult<true>> {
    if (!settings) {
      return { data: true, error: null };
    }

    const eventDate = new Date(`${payload.event_date}T00:00:00.000Z`);
    const now = new Date();
    const daysDiff = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff < settings.event_request_advance_days) {
      return {
        data: null,
        error: toServiceError(
          'ADVANCE_DAYS_VIOLATION',
          `Event must be requested at least ${settings.event_request_advance_days} days in advance.`
        ),
      };
    }

    const dayOfWeek = eventDate.getUTCDay();
    const bannedDays = settings.banned_days_of_week ?? [];
    if (bannedDays.includes(dayOfWeek)) {
      return {
        data: null,
        error: toServiceError('BANNED_DAY_VIOLATION', 'Selected event day is not allowed by organization settings.'),
      };
    }

    const bannedDates = new Set((settings.banned_specific_dates ?? []).map((d) => d.trim()));
    if (bannedDates.has(payload.event_date)) {
      return {
        data: null,
        error: toServiceError('BANNED_DATE_VIOLATION', 'Selected event date is blocked by organization settings.'),
      };
    }

    if (!settings.allow_weekend_events && (dayOfWeek === 0 || dayOfWeek === 6)) {
      return {
        data: null,
        error: toServiceError('WEEKEND_NOT_ALLOWED', 'Weekend events are not allowed for this organization.'),
      };
    }

    const { count, error: countError } = await this.supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', payload.org_id)
      .eq('event_date', payload.event_date)
      .in('status', ['requested', 'pending', 'approved', 'rescheduled']);

    if (countError) {
      return {
        data: null,
        error: toServiceError('EVENT_COUNT_LOOKUP_FAILED', 'Failed to validate daily event limit.', countError),
      };
    }

    const eventCount = count ?? 0;
    if (eventCount >= settings.max_events_per_day) {
      return {
        data: null,
        error: toServiceError('MAX_EVENTS_PER_DAY_EXCEEDED', 'Maximum events per day has been reached.'),
      };
    }

    if (settings.prevent_double_booking_same_day) {
      const { data: sameDayEvents, error: sameDayError } = await this.supabase
        .from('events')
        .select('id, start_time, end_time')
        .eq('org_id', payload.org_id)
        .eq('event_date', payload.event_date)
        .in('status', ['requested', 'pending', 'approved', 'rescheduled']);

      if (sameDayError) {
        return {
          data: null,
          error: toServiceError('DOUBLE_BOOKING_CHECK_FAILED', 'Failed to validate double booking.', sameDayError),
        };
      }

      const start = this.parseTimeToMinutes(payload.start_time);
      const end = this.parseTimeToMinutes(payload.end_time);

      const hasOverlap = (sameDayEvents ?? []).some((existing) => {
        const existingStart = this.parseTimeToMinutes(String(existing.start_time));
        const existingEnd = this.parseTimeToMinutes(String(existing.end_time));
        return start < existingEnd && end > existingStart;
      });

      if (hasOverlap) {
        return {
          data: null,
          error: toServiceError('DOUBLE_BOOKING_NOT_ALLOWED', 'Event time conflicts with an existing event.'),
        };
      }
    }

    return { data: true, error: null };
  }

  private async createNotification(params: {
    org_id: string;
    user_id?: string | null;
    actor_user_id?: string | null;
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  }): Promise<void> {
    await this.supabase.from('notifications').insert({
      org_id: params.org_id,
      user_id: params.user_id ?? null,
      created_by_user_id: params.actor_user_id ?? null,
      type: params.type,
      title: params.title,
      message: params.message,
      data: params.data ?? {},
      priority: params.priority ?? 'normal',
    });
  }

  private async createSystemLog(params: {
    org_id: string;
    user_id?: string | null;
    action_type: string;
    entity_type: string;
    entity_id?: string;
    payload?: Record<string, unknown>;
    notes?: string;
    status?: string;
  }): Promise<void> {
    await this.supabase.from('system_logs').insert({
      org_id: params.org_id,
      user_id: params.user_id ?? null,
      category: 'events',
      action_type: params.action_type,
      entity_type: params.entity_type,
      entity_id: params.entity_id ?? null,
      payload: params.payload ?? {},
      notes: params.notes ?? null,
      status: params.status ?? null,
    });
  }

  async createEvent(actor: EventActorContext, input: EventCreateInput): Promise<ServiceResult<EventRow>> {
    try {
      if (!actor.is_active) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'Inactive users cannot create events.'),
        };
      }

      const parsed = EventCreateSchema.parse(input);
      if (parsed.org_id !== actor.org_id) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You can only create events in your own organization.'),
        };
      }

      if (!hasPermission(actor, 'create_events') && !hasRoleAtLeast(actor, 'coordinator')) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You do not have permission to create events.'),
        };
      }

      const settingsResult = await this.getOrganizationSettings(parsed.org_id);
      if (settingsResult.error) {
        return { data: null, error: settingsResult.error };
      }

      const settingsCheck = await this.validateCreationAgainstSettings(parsed, settingsResult.data);
      if (settingsCheck.error) {
        return { data: null, error: settingsCheck.error };
      }

      const canAutoApprove = hasRoleAtLeast(actor, 'admin') || hasPermission(actor, 'auto_approve_events');
      const requestedAutoApprove = parsed.status === 'approved';

      if (requestedAutoApprove && !canAutoApprove) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'Only admin roles can auto-approve events on creation.'),
        };
      }

      const status: EventStatus = requestedAutoApprove
        ? 'approved'
        : parsed.status && ['requested', 'pending'].includes(parsed.status)
          ? parsed.status
          : 'requested';

      const { data, error } = await this.supabase
        .from('events')
        .insert({
          org_id: parsed.org_id,
          title: parsed.title,
          address: parsed.address,
          type: parsed.type,
          event_date: parsed.event_date,
          start_time: parsed.start_time,
          end_time: parsed.end_time,
          description: parsed.description ?? null,
          image_url: parsed.image_url ?? null,
          extra_data: parsed.extra_data,
          status,
          requested_by_user_id: parsed.requested_by_user_id ?? actor.id,
          is_public: parsed.is_public ?? false,
        })
        .select('*')
        .single();

      if (error || !data) {
        return {
          data: null,
          error: toServiceError('EVENT_CREATE_FAILED', 'Failed to create event.', error),
        };
      }

      const created = data as EventRow;

      const isAutoApproved = created.status === 'approved';

      await this.supabase.from('event_approvals').insert({
        org_id: created.org_id,
        event_id: created.id,
        acted_by_user_id: actor.id,
        action: isAutoApproved ? 'auto_approve' : 'request',
        from_status: null,
        to_status: created.status,
        approval_level: isAutoApproved ? actor.role.type : 'requester',
        geo_scope: actor.geographic_area,
        notes: isAutoApproved ? 'Event auto-approved during creation.' : 'Event requested for review.',
      });

      await this.createSystemLog({
        org_id: created.org_id,
        user_id: actor.id,
        action_type: 'event_created',
        entity_type: 'event',
        entity_id: created.id,
        payload: {
          status: created.status,
          event_date: created.event_date,
          type: created.type,
        },
        status: created.status,
      });

      await this.createNotification({
        org_id: created.org_id,
        user_id: null,
        actor_user_id: actor.id,
        type: 'event.created',
        title: 'New event created',
        message: `${created.title} was created and is currently ${created.status}.`,
        data: {
          event_id: created.id,
          status: created.status,
          requested_by_user_id: created.requested_by_user_id,
        },
      });

      return { data: created, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('EVENT_CREATE_VALIDATION_ERROR', 'Invalid event payload.', error),
      };
    }
  }

  async updateEvent(actor: EventActorContext, eventId: string, input: EventUpdateInput): Promise<ServiceResult<EventRow>> {
    try {
      const parsed = EventUpdateSchema.parse(input);
      const existingResult = await this.getEventById(eventId, actor);
      if (existingResult.error || !existingResult.data) {
        return { data: null, error: existingResult.error };
      }

      const existing = existingResult.data;
      if (existing.org_id !== actor.org_id) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'Cannot update events from a different organization.'),
        };
      }

      const canEdit =
        hasPermission(actor, 'manage_events') ||
        hasPermission(actor, 'edit_events') ||
        hasRoleAtLeast(actor, 'coordinator') ||
        existing.requested_by_user_id === actor.id;

      if (!canEdit) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You do not have permission to update this event.'),
        };
      }

      if (parsed.status && !canTransitionEventStatus(existing.status, parsed.status)) {
        return {
          data: null,
          error: toServiceError('INVALID_STATUS_TRANSITION', `Invalid status transition: ${existing.status} -> ${parsed.status}.`),
        };
      }

      const { data, error } = await this.supabase
        .from('events')
        .update(parsed)
        .eq('id', eventId)
        .eq('org_id', actor.org_id)
        .select('*')
        .single();

      if (error || !data) {
        return {
          data: null,
          error: toServiceError('EVENT_UPDATE_FAILED', 'Failed to update event.', error),
        };
      }

      const updated = data as EventRow;
      await this.createSystemLog({
        org_id: updated.org_id,
        user_id: actor.id,
        action_type: 'event_updated',
        entity_type: 'event',
        entity_id: updated.id,
        payload: {
          before: existing,
          after: updated,
        },
        status: updated.status,
      });

      if (existing.status !== updated.status) {
        await this.createNotification({
          org_id: updated.org_id,
          user_id: updated.requested_by_user_id,
          actor_user_id: actor.id,
          type: 'event.status_changed',
          title: 'Event status updated',
          message: `${updated.title} changed from ${existing.status} to ${updated.status}.`,
          data: {
            event_id: updated.id,
            from_status: existing.status,
            to_status: updated.status,
          },
        });
      }

      return { data: updated, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('EVENT_UPDATE_VALIDATION_ERROR', 'Invalid event update payload.', error),
      };
    }
  }

  async deleteEvent(actor: EventActorContext, eventId: string): Promise<ServiceResult<null>> {
    const existingResult = await this.getEventById(eventId, actor);
    if (existingResult.error || !existingResult.data) {
      return { data: null, error: existingResult.error };
    }

    const existing = existingResult.data;
    if (existing.org_id !== actor.org_id) {
      return {
        data: null,
        error: toServiceError('PERMISSION_DENIED', 'Cannot delete events from a different organization.'),
      };
    }

    const canDelete =
      hasPermission(actor, 'manage_events') ||
      hasPermission(actor, 'edit_events') ||
      hasRoleAtLeast(actor, 'admin');

    if (!canDelete) {
      return {
        data: null,
        error: toServiceError('PERMISSION_DENIED', 'You do not have permission to delete this event.'),
      };
    }

    if (!['requested', 'rejected'].includes(existing.status)) {
      return {
        data: null,
        error: toServiceError('INVALID_STATUS_TRANSITION', 'Only requested or rejected events can be deleted.'),
      };
    }

    const { error } = await this.supabase
      .from('events')
      .delete()
      .eq('id', eventId)
      .eq('org_id', actor.org_id);

    if (error) {
      return {
        data: null,
        error: toServiceError('EVENT_DELETE_FAILED', 'Failed to delete event.', error),
      };
    }

    await this.createSystemLog({
      org_id: existing.org_id,
      user_id: actor.id,
      action_type: 'event_deleted',
      entity_type: 'event',
      entity_id: existing.id,
      payload: {
        title: existing.title,
        status: existing.status,
        event_date: existing.event_date,
      },
      status: existing.status,
    });

    return { data: null, error: null };
  }

  private isEventVisibleToActor(event: EventRow, actor: EventActorContext): boolean {
    if (event.org_id !== actor.org_id) {
      return event.is_public;
    }

    if (hasRoleAtLeast(actor, 'admin') || hasPermission(actor, 'manage_events')) {
      return true;
    }

    const hasViewPermission =
      hasRoleAtLeast(actor, 'staff') ||
      hasPermission(actor, 'view_events') ||
      hasPermission(actor, 'events.read');
    const hasReviewPermission =
      hasPermission(actor, 'approve_events') ||
      hasPermission(actor, 'events.approve');
    const isRequester = event.requested_by_user_id === actor.id;
    const hasEventScopePermission = hasViewPermission || hasReviewPermission || isRequester;

    if (!hasEventScopePermission && !event.is_public) {
      return false;
    }

    const workflowScope = getEventWorkflowScope(event.extra_data);
    const eventGeoScope = workflowScope.geoScope;

    return isGeoAreaMatch(eventGeoScope, actor.geographic_area);
  }

  async listEvents(actor: EventActorContext, filter: EventFilter = {}): Promise<ServiceResult<EventRow[]>> {
    try {
      const parsed = EventFilterSchema.parse(filter);
      const limit = parsed.limit ?? 50;
      const offset = parsed.offset ?? 0;

      let query = this.supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true })
        .range(offset, offset + limit - 1);

      if (parsed.org_id) {
        query = query.eq('org_id', parsed.org_id);
      } else {
        query = query.eq('org_id', actor.org_id);
      }

      if (parsed.statuses && parsed.statuses.length > 0) {
        query = query.in('status', parsed.statuses);
      }

      if (parsed.types && parsed.types.length > 0) {
        query = query.in('type', parsed.types);
      }

      if (parsed.from_date) {
        query = query.gte('event_date', parsed.from_date);
      }

      if (parsed.to_date) {
        query = query.lte('event_date', parsed.to_date);
      }

      if (parsed.requested_by_user_id) {
        query = query.eq('requested_by_user_id', parsed.requested_by_user_id);
      }

      const { data, error } = await query;
      if (error) {
        return {
          data: null,
          error: toServiceError('EVENT_LIST_FAILED', 'Failed to list events.', error),
        };
      }

      const rows = (data as EventRow[]) ?? [];
      const visible = rows.filter((event) => this.isEventVisibleToActor(event, actor));

      const withPublic = parsed.include_public
        ? [
            ...visible,
            ...rows.filter((event) => event.is_public && event.org_id !== actor.org_id),
          ]
        : visible;

      const uniqueById = new Map<string, EventRow>();
      for (const event of withPublic) {
        uniqueById.set(event.id, event);
      }

      let result = Array.from(uniqueById.values());

      if (parsed.search) {
        const q = parsed.search.toLowerCase();
        result = result.filter((event) => buildEventSearchText(event).includes(q));
      }

      const enriched = await this.enrichEvents(result);
      if (enriched.error || !enriched.data) {
        return { data: null, error: enriched.error };
      }

      return { data: enriched.data, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('EVENT_LIST_VALIDATION_ERROR', 'Invalid event list filter.', error),
      };
    }
  }

  async listPublicEvents(filter: PublicEventFilter = {}): Promise<ServiceResult<EventRow[]>> {
    try {
      const parsed = PublicEventFilterSchema.parse(filter);
      const limit = parsed.limit ?? 50;
      const offset = parsed.offset ?? 0;

      let query = this.supabase
        .from('events')
        .select('*')
        .eq('is_public', true)
        .eq('status', 'approved')
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true })
        .range(offset, offset + limit - 1);

      if (parsed.from_date) {
        query = query.gte('event_date', parsed.from_date);
      }

      if (parsed.to_date) {
        query = query.lte('event_date', parsed.to_date);
      }

      if (parsed.types && parsed.types.length > 0) {
        query = query.in('type', parsed.types);
      }

      const { data, error } = await query;
      if (error) {
        return {
          data: null,
          error: toServiceError('PUBLIC_EVENT_LIST_FAILED', 'Failed to fetch public events.', error),
        };
      }

      let rows = (data as EventRow[]) ?? [];
      if (parsed.search) {
        const q = parsed.search.toLowerCase();
        rows = rows.filter((event) => buildEventSearchText(event).includes(q));
      }

      return { data: rows, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('PUBLIC_EVENT_FILTER_INVALID', 'Invalid public event filter.', error),
      };
    }
  }

  private async updatePublishedEventStatus(
    actor: EventActorContext,
    eventId: string,
    params: {
      targetStatus: Extract<EventStatus, 'pending' | 'rescheduled' | 'rejected'>;
      actionType: 'event_rescheduled' | 'event_cancelled';
      eventApprovalAction: 'reschedule' | 'reject';
      notes?: string | null;
      schedule?: { event_date?: string; start_time?: string; end_time?: string };
    }
  ): Promise<ServiceResult<EventRow>> {
    const eventResult = await this.getEventById(eventId, actor);
    if (eventResult.error || !eventResult.data) {
      return { data: null, error: eventResult.error };
    }

    const event = eventResult.data;
    if (event.org_id !== actor.org_id) {
      return {
        data: null,
        error: toServiceError('PERMISSION_DENIED', 'Cannot modify an event from another organization.'),
      };
    }

    if (event.status !== 'approved') {
      return {
        data: null,
        error: toServiceError('INVALID_STATUS_TRANSITION', 'Only approved events can be canceled or rescheduled.'),
      };
    }

    const canManage = hasPermission(actor, 'manage_events') || hasPermission(actor, 'approve_events') || hasRoleAtLeast(actor, 'coordinator');
    if (!canManage) {
      return {
        data: null,
        error: toServiceError('PERMISSION_DENIED', 'You do not have permission to change published events.'),
      };
    }

    const patch: Partial<EventUpdateInput> = {
      status: params.targetStatus,
    };

    if (params.schedule?.event_date) {
      patch.event_date = params.schedule.event_date;
    }
    if (params.schedule?.start_time) {
      patch.start_time = params.schedule.start_time;
    }
    if (params.schedule?.end_time) {
      patch.end_time = params.schedule.end_time;
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
        error: toServiceError('EVENT_STATUS_UPDATE_FAILED', 'Failed to update published event status.', error),
      };
    }

    const updated = data as EventRow;

    await this.supabase.from('event_approvals').insert({
      org_id: updated.org_id,
      event_id: updated.id,
      acted_by_user_id: actor.id,
      action: params.eventApprovalAction,
      from_status: event.status,
      to_status: updated.status,
      approval_level: actor.role.type,
      geo_scope: actor.geographic_area,
      notes: params.notes ?? null,
    });

    await this.createSystemLog({
      org_id: updated.org_id,
      user_id: actor.id,
      action_type: params.actionType,
      entity_type: 'event',
      entity_id: updated.id,
      payload: {
        from_status: event.status,
        to_status: updated.status,
        notes: params.notes ?? null,
        schedule: params.schedule ?? null,
      },
      status: updated.status,
      notes: params.notes ?? undefined,
    });

    await this.createNotification({
      org_id: updated.org_id,
      user_id: updated.requested_by_user_id,
      actor_user_id: actor.id,
      type: params.actionType === 'event_cancelled' ? 'event.cancelled' : 'event.rescheduled',
      title: params.actionType === 'event_cancelled' ? 'Event canceled' : 'Event rescheduled',
      message:
        params.actionType === 'event_cancelled'
          ? `${updated.title} was canceled.`
          : `${updated.title} was moved for re-review and scheduling updates.`,
      data: {
        event_id: updated.id,
        from_status: event.status,
        to_status: updated.status,
      },
      priority: 'high',
    });

    return { data: updated, error: null };
  }

  async cancelPublishedEvent(
    actor: EventActorContext,
    eventId: string,
    notes?: string | null
  ): Promise<ServiceResult<EventRow>> {
    return this.updatePublishedEventStatus(actor, eventId, {
      targetStatus: 'rejected',
      actionType: 'event_cancelled',
      eventApprovalAction: 'reject',
      notes,
    });
  }

  async reschedulePublishedEvent(
    actor: EventActorContext,
    eventId: string,
    input: { event_date: string; start_time: string; end_time: string; notes?: string | null }
  ): Promise<ServiceResult<EventRow>> {
    const parsed = z
      .object({
        event_date: z.string().date(),
        start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
        end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
        notes: z.string().trim().optional().nullable(),
      })
      .parse(input);

    return this.updatePublishedEventStatus(actor, eventId, {
      targetStatus: 'rescheduled',
      actionType: 'event_rescheduled',
      eventApprovalAction: 'reschedule',
      notes: parsed.notes,
      schedule: {
        event_date: parsed.event_date,
        start_time: parsed.start_time,
        end_time: parsed.end_time,
      },
    });
  }

  subscribeToEventUpdates(orgId: string, handlers: EventSubscriptionHandlers): RealtimeChannel {
    const channel = this.supabase
      .channel(`events:${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events', filter: `org_id=eq.${orgId}` },
        (payload) => {
          if (handlers.onInsert) {
            handlers.onInsert(payload.new as EventRow);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `org_id=eq.${orgId}` },
        (payload) => {
          if (handlers.onUpdate) {
            handlers.onUpdate(payload.new as EventRow);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'events', filter: `org_id=eq.${orgId}` },
        (payload) => {
          if (handlers.onDelete) {
            handlers.onDelete(payload.old as Pick<EventRow, 'id' | 'org_id'>);
          }
        }
      )
      .subscribe();

    return channel;
  }

  async buildActorContext(userId: string): Promise<ServiceResult<EventActorContext>> {
    const actorResult = await this.getActorById(userId);
    if (actorResult.error || !actorResult.data) {
      return { data: null, error: actorResult.error };
    }

    const actor = actorResult.data;
    return {
      data: {
        id: actor.id,
        org_id: actor.org_id,
        role: actor.role,
        geographic_area: actor.geographic_area,
        is_active: actor.is_active,
      },
      error: null,
    };
  }
}
