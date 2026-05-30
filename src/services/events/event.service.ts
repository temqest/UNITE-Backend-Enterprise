import { z } from 'zod';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type {
  EventCreateInput,
  EventRow,
  EventSetupStatus,
  EventStatus,
  EventUpdateInput,
  EventVisibility,
} from '../../models/events/types';
import type { OrganizationSettingsRow } from '../../models/organization_settings/types';
import type { UserRow } from '../../models/users/types';
import type {
  EventActorContext,
  EventFilter,
  EventStatusUpdateInput,
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
import { normalizeGeoAreaKey } from '../../utils/geo';

const eventTypeSchema = z.enum(['blood_drive', 'training', 'advocacy', 'assembly']);
const eventStatusSchema = z.enum(['draft', 'plotted', 'needs_details', 'scheduled', 'published', 'ongoing', 'completed', 'cancelled']);
const eventSetupStatusSchema = z.enum(['needs_details', 'pending_setup', 'complete']);
const eventCreationMethodSchema = z.enum(['manual', 'plotting_calendar']);
const eventVisibilitySchema = z.enum(['internal', 'public']);

const EventCreateSchema = z.object({
  org_id: z.string().uuid(),
  title: z.string().trim().min(3),
  address: z.string().trim().min(1).optional().nullable(),
  type: eventTypeSchema,
  event_date: z.string().date(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
  description: z.string().trim().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  extra_data: z.record(z.string(), z.unknown()).optional().default({}),
  status: eventStatusSchema.optional(),
  setup_status: eventSetupStatusSchema.optional(),
  setup_completed_at: z.string().datetime().optional().nullable(),
  creation_method: eventCreationMethodSchema.optional(),
  plotting_calendar_id: z.string().uuid().optional().nullable(),
  hosting_organization: z.string().trim().optional().nullable(),
  visibility: eventVisibilitySchema.optional(),
  requested_by_user_id: z.string().uuid().optional().nullable(),
  is_public: z.boolean().optional(),
  coverage_area_id: z.string().uuid().optional().nullable(),
  coverage_area_psgc_code: z.string().trim().optional().nullable(),
  coverage_area_boundary_id: z.string().trim().optional().nullable(),
  coverage_area_name: z.string().trim().optional().nullable(),
  coverage_area_province: z.string().trim().optional().nullable(),
  coverage_area_municipality: z.string().trim().optional().nullable(),
  coverage_area_barangay: z.string().trim().optional().nullable(),
  coverage_area_normalized_key: z.string().trim().optional().nullable(),
  created_by: z.string().uuid().optional().nullable(),
  updated_by: z.string().uuid().optional().nullable(),
}).superRefine((value, context) => {
  if (value.start_time && value.end_time && value.start_time >= value.end_time) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_time'],
      message: 'end_time must be later than start_time.',
    });
  }
});

const EventUpdateSchema = z.object({
  title: z.string().trim().min(3).optional(),
  address: z.string().trim().min(1).optional().nullable(),
  type: eventTypeSchema.optional(),
  event_date: z.string().date().optional(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
  description: z.string().trim().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  extra_data: z.record(z.string(), z.unknown()).optional(),
  status: eventStatusSchema.optional(),
  setup_status: eventSetupStatusSchema.optional(),
  setup_completed_at: z.string().datetime().optional().nullable(),
  creation_method: eventCreationMethodSchema.optional(),
  plotting_calendar_id: z.string().uuid().optional().nullable(),
  hosting_organization: z.string().trim().optional().nullable(),
  visibility: eventVisibilitySchema.optional(),
  completed_at: z.string().datetime().optional().nullable(),
  actual_collected_bags: z.number().int().min(0).optional().nullable(),
  actual_donors: z.number().int().min(0).optional().nullable(),
  wastage_units: z.number().int().min(0).optional().nullable(),
  post_event_notes: z.string().trim().optional().nullable(),
  post_event_attachments: z.array(z.string().url()).optional(),
  is_public: z.boolean().optional(),
  coverage_area_id: z.string().uuid().optional().nullable(),
  coverage_area_psgc_code: z.string().trim().optional().nullable(),
  coverage_area_boundary_id: z.string().trim().optional().nullable(),
  coverage_area_name: z.string().trim().optional().nullable(),
  coverage_area_province: z.string().trim().optional().nullable(),
  coverage_area_municipality: z.string().trim().optional().nullable(),
  coverage_area_barangay: z.string().trim().optional().nullable(),
  coverage_area_normalized_key: z.string().trim().optional().nullable(),
  updated_by: z.string().uuid().optional().nullable(),
}).superRefine((value, context) => {
  if (value.start_time && value.end_time && value.start_time >= value.end_time) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_time'],
      message: 'end_time must be later than start_time.',
    });
  }
});

const QuickEventCreateSchema = z.object({
  org_id: z.string().uuid().optional(),
  title: z.string().trim().min(3),
  type: eventTypeSchema,
  event_date: z.string().date(),
  venue_name: z.string().trim().optional().nullable(),
  municipality: z.string().trim().optional().nullable(),
  province: z.string().trim().optional().nullable(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
  hosting_organization: z.string().trim().optional().nullable(),
}).superRefine((value, context) => {
  if (value.start_time && value.end_time && value.start_time >= value.end_time) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_time'],
      message: 'end_time must be later than start_time.',
    });
  }
});

const CompleteEventDetailsSchema = z.object({
  title: z.string().trim().min(3).optional(),
  type: eventTypeSchema.optional(),
  event_date: z.string().date().optional(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
  address: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  status_action: z.enum(['draft', 'pending_setup', 'scheduled', 'publish']).optional(),
  is_public: z.boolean().optional(),
  visibility: eventVisibilitySchema.optional(),
  hosting_organization: z.string().trim().optional().nullable(),
  extra_data: z.record(z.string(), z.unknown()).optional(),
  assigned_staff_ids: z.array(z.string().uuid()).optional(),
  coverage_area_id: z.string().uuid().optional().nullable(),
  coverage_area_psgc_code: z.string().trim().optional().nullable(),
  coverage_area_boundary_id: z.string().trim().optional().nullable(),
  coverage_area_name: z.string().trim().optional().nullable(),
  coverage_area_province: z.string().trim().optional().nullable(),
  coverage_area_municipality: z.string().trim().optional().nullable(),
  coverage_area_barangay: z.string().trim().optional().nullable(),
  coverage_area_normalized_key: z.string().trim().optional().nullable(),
}).superRefine((value, context) => {
  if (value.start_time && value.end_time && value.start_time >= value.end_time) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_time'],
      message: 'end_time must be later than start_time.',
    });
  }
});

const EventFilterSchema = z.object({
  org_id: z.string().uuid().optional(),
  statuses: z.array(eventStatusSchema).optional(),
  setup_statuses: z.array(eventSetupStatusSchema).optional(),
  creation_methods: z.array(eventCreationMethodSchema).optional(),
  types: z.array(eventTypeSchema).optional(),
  from_date: z.string().date().optional(),
  to_date: z.string().date().optional(),
  requested_by_user_id: z.string().uuid().optional(),
  include_public: z.boolean().optional(),
  hosting_organization: z.string().trim().optional(),
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

const PublicEventFilterSchema = z.object({
  from_date: z.string().date().optional(),
  to_date: z.string().date().optional(),
  types: z.array(eventTypeSchema).optional(),
  province: z.string().trim().optional(),
  city: z.string().trim().optional(),
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

const EventStatusUpdateSchema = z.object({
  event_id: z.string().uuid(),
  status: eventStatusSchema,
  notes: z.string().trim().optional().nullable(),
});

function normalizeExtraData(extraData: unknown): Record<string, unknown> {
  if (!extraData || typeof extraData !== 'object' || Array.isArray(extraData)) {
    return {};
  }

  return { ...(extraData as Record<string, unknown>) };
}

function getTextValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function getNumberValue(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function getArrayCount(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return Array.isArray(value) ? value.length : 0;
}

function extraValueToString(extraData: unknown, key: string): string {
  if (!extraData || typeof extraData !== 'object' || Array.isArray(extraData)) {
    return '';
  }

  const value = (extraData as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

function isPublishedVisibility(event: Pick<EventRow, 'status' | 'visibility' | 'is_public' | 'setup_status'>): boolean {
  return (
    event.status === 'published' &&
    event.setup_status === 'complete' &&
    (event.visibility === 'public' || event.is_public === true)
  );
}

export class EventService {
  constructor(private readonly supabase: SupabaseClient) {}

  private async autoMatchCoverageArea(orgId: string, event: Partial<EventRow>): Promise<string | null> {
    if (event.coverage_area_id) {
      return event.coverage_area_id;
    }
    if (!event.coverage_area_psgc_code && !event.coverage_area_normalized_key) {
      return null;
    }
    let query = this.supabase.from('organization_coverage_areas').select('id').eq('org_id', orgId);
    if (event.coverage_area_psgc_code && event.coverage_area_normalized_key) {
      query = query.or(`psgc_code.eq.${event.coverage_area_psgc_code},normalized_area_key.eq.${event.coverage_area_normalized_key}`);
    } else if (event.coverage_area_psgc_code) {
      query = query.eq('psgc_code', event.coverage_area_psgc_code);
    } else if (event.coverage_area_normalized_key) {
      query = query.eq('normalized_area_key', event.coverage_area_normalized_key);
    }
    const { data } = await query.maybeSingle();
    return data ? data.id : null;
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
        full_name: [first, last].filter(Boolean).join(' ').trim() || 'Unknown creator',
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

  private async enrichEvents(events: EventRow[]): Promise<ServiceResult<EventRow[]>> {
    const withRequesterResult = await this.withRequester(events);

    if (withRequesterResult.error || !withRequesterResult.data) {
      return { data: null, error: withRequesterResult.error };
    }

    const requesterById = new Map(withRequesterResult.data.map((event) => [event.id, event.requested_by ?? null]));

    return {
      data: events.map((event) => ({
        ...event,
        requested_by: requesterById.get(event.id) ?? null,
        latest_approval: null,
      })),
      error: null,
    };
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

  private parseTimeToMinutes(timeValue: string): number {
    const [hours, minutes] = timeValue.split(':');
    return Number(hours) * 60 + Number(minutes);
  }

  private async validateCreationAgainstSettings(
    payload: { org_id: string; event_date: string; start_time: string; end_time: string; exclude_event_id?: string; creation_method?: string },
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
          `Event must be created at least ${settings.event_request_advance_days} days in advance.`
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

    const bannedDates = new Set((settings.banned_specific_dates ?? []).map((value) => value.trim()));
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

    const activeStatuses: EventStatus[] = ['plotted', 'needs_details', 'scheduled', 'published', 'ongoing'];
    const { data: sameDayEvents, error: sameDayError } = await this.supabase
      .from('events')
      .select('id, start_time, end_time')
      .eq('org_id', payload.org_id)
      .eq('event_date', payload.event_date)
      .in('status', activeStatuses);

    if (sameDayError) {
      return {
        data: null,
        error: toServiceError('EVENT_COUNT_LOOKUP_FAILED', 'Failed to validate organization event limits.', sameDayError),
      };
    }

    const filteredSameDayEvents = ((sameDayEvents ?? []) as Array<{ id: string; start_time: string | null; end_time: string | null }>)
      .filter((event) => event.id !== payload.exclude_event_id);

    if (payload.creation_method !== 'plotting_calendar') {
      if (filteredSameDayEvents.length >= settings.max_events_per_day) {
        return {
          data: null,
          error: toServiceError('MAX_EVENTS_PER_DAY_EXCEEDED', 'Maximum events per day has been reached.'),
        };
      }

      if (settings.prevent_double_booking_same_day) {
        const start = this.parseTimeToMinutes(payload.start_time);
        const end = this.parseTimeToMinutes(payload.end_time);

        const hasOverlap = filteredSameDayEvents.some((existing) => {
          if (!existing.start_time || !existing.end_time) {
            return false;
          }

          const existingStart = this.parseTimeToMinutes(existing.start_time);
          const existingEnd = this.parseTimeToMinutes(existing.end_time);
          return start < existingEnd && end > existingStart;
        });

        if (hasOverlap) {
          return {
            data: null,
            error: toServiceError('DOUBLE_BOOKING_NOT_ALLOWED', 'Event time conflicts with an existing event.'),
          };
        }
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

  private async getAssignedStaffCount(eventId: string): Promise<ServiceResult<number>> {
    const { count, error } = await this.supabase
      .from('event_staff')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId);

    if (error) {
      return {
        data: null,
        error: toServiceError('EVENT_STAFF_COUNT_FAILED', 'Failed to check event staff assignments.', error),
      };
    }

    return { data: count ?? 0, error: null };
  }

  private async syncAssignedStaff(params: {
    event: EventRow;
    actor: EventActorContext;
    userIds: string[];
  }): Promise<ServiceResult<true>> {
    const uniqueIds = Array.from(new Set(params.userIds.filter(Boolean)));
    const { error: deleteError } = await this.supabase
      .from('event_staff')
      .delete()
      .eq('event_id', params.event.id)
      .eq('org_id', params.event.org_id);

    if (deleteError) {
      return {
        data: null,
        error: toServiceError('EVENT_STAFF_SYNC_FAILED', 'Failed to clear previous staff assignments.', deleteError),
      };
    }

    if (uniqueIds.length === 0) {
      return { data: true, error: null };
    }

    const rows = uniqueIds.map((userId, index) => ({
      org_id: params.event.org_id,
      event_id: params.event.id,
      user_id: userId,
      assignment_role: index === 0 ? 'lead' : 'staff',
      notes: index === 0 ? 'Assigned during event planning.' : null,
    }));

    const { error: insertError } = await this.supabase.from('event_staff').insert(rows);
    if (insertError) {
      return {
        data: null,
        error: toServiceError('EVENT_STAFF_SYNC_FAILED', 'Failed to assign event staff.', insertError),
      };
    }

    return { data: true, error: null };
  }

  private async validatePublishReadiness(event: EventRow): Promise<ServiceResult<true>> {
    const missing: string[] = [];

    if (!event.title?.trim()) missing.push('Event title');
    if (!event.type) missing.push('Event type');
    if (!event.event_date) missing.push('Event date');
    if (!event.hosting_organization?.trim()) missing.push('Hosting organization');

    if (missing.length > 0) {
      return {
        data: null,
        error: toServiceError(
          'EVENT_SETUP_INCOMPLETE',
          'Please complete the required fields before publishing.',
          { missing }
        ),
      };
    }

    return { data: true, error: null };
  }

  private canViewOrgEvent(actor: EventActorContext, event: EventRow): boolean {
    const sameOrg = event.org_id === actor.org_id;
    if (!sameOrg) {
      return isPublishedVisibility(event);
    }

    if (hasRoleAtLeast(actor, 'admin') || hasPermission(actor, 'events.read')) {
      return true;
    }

    if (event.requested_by_user_id === actor.id) {
      return true;
    }

    if (!hasRoleAtLeast(actor, 'staff') && !event.is_public) {
      return false;
    }

    const geoScopeRaw = normalizeExtraData(event.extra_data).geo_scope;
    const geoScope =
      geoScopeRaw && typeof geoScopeRaw === 'object' && !Array.isArray(geoScopeRaw)
        ? (geoScopeRaw as Record<string, unknown>)
        : null;

    return isGeoAreaMatch(actor.geographic_area, geoScope);
  }

  private canEditEvent(actor: EventActorContext, event: EventRow): boolean {
    return (
      event.org_id === actor.org_id &&
      (
        event.requested_by_user_id === actor.id ||
        hasRoleAtLeast(actor, 'coordinator') ||
        hasPermission(actor, 'events.update')
      )
    );
  }

  private canPublishEvent(actor: EventActorContext): boolean {
    return (
      hasRoleAtLeast(actor, 'coordinator') ||
      hasPermission(actor, 'events.approve') ||
      (hasPermission(actor, 'events.update') && hasRoleAtLeast(actor, 'admin'))
    );
  }

  private canCancelEvent(actor: EventActorContext): boolean {
    return this.canPublishEvent(actor) || hasPermission(actor, 'events.update');
  }

  private async validateEventWindow(
    event: Pick<EventRow, 'org_id' | 'event_date' | 'start_time' | 'end_time' | 'id' | 'creation_method'>
  ): Promise<ServiceResult<true>> {
    if (!event.start_time || !event.end_time) {
      return { data: true, error: null };
    }

    const settingsResult = await this.getOrganizationSettings(event.org_id);
    if (settingsResult.error) {
      return { data: null, error: settingsResult.error };
    }

    return this.validateCreationAgainstSettings(
      {
        org_id: event.org_id,
        event_date: event.event_date,
        start_time: event.start_time,
        end_time: event.end_time,
        exclude_event_id: event.id,
        creation_method: event.creation_method,
      },
      settingsResult.data
    );
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
      if (!isPublishedVisibility(event)) {
        return {
          data: null,
          error: toServiceError('EVENT_NOT_VISIBLE', 'Event is not publicly visible.'),
        };
      }

      const enriched = await this.enrichEvents([event]);
      return enriched.error || !enriched.data?.[0]
        ? { data: null, error: enriched.error }
        : { data: enriched.data[0], error: null };
    }

    if (!this.canViewOrgEvent(actor, event)) {
      return {
        data: null,
        error: toServiceError('PERMISSION_DENIED', 'You do not have permission to view this event.'),
      };
    }

    const enriched = await this.enrichEvents([event]);
    return enriched.error || !enriched.data?.[0]
      ? { data: null, error: enriched.error }
      : { data: enriched.data[0], error: null };
  }

  async quickCreateEvent(actor: EventActorContext, input: unknown): Promise<ServiceResult<EventRow>> {
    try {
      if (!actor.is_active) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'Inactive users cannot create events.'),
        };
      }

      if (!hasPermission(actor, 'events.create') && !hasRoleAtLeast(actor, 'coordinator')) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You do not have permission to create events.'),
        };
      }

      const parsed = QuickEventCreateSchema.parse(input);
      const orgId = parsed.org_id ?? actor.org_id;
      if (orgId !== actor.org_id) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You can only create events in your own organization.'),
        };
      }

      const extraData: Record<string, unknown> = {
        quick_setup: true,
        venue_name: parsed.venue_name ?? null,
        province: parsed.province ?? null,
        municipality: parsed.municipality ?? null,
        location: parsed.venue_name || parsed.municipality || parsed.province || null,
      };

      return this.createEvent(actor, {
        org_id: orgId,
        title: parsed.title,
        address: parsed.venue_name || parsed.municipality || parsed.province || null,
        type: parsed.type,
        event_date: parsed.event_date,
        start_time: parsed.start_time ?? null,
        end_time: parsed.end_time ?? null,
        description: null,
        extra_data: extraData,
        status: 'draft',
        setup_status: 'needs_details',
        creation_method: 'manual',
        hosting_organization: parsed.hosting_organization ?? null,
        requested_by_user_id: actor.id,
        created_by: actor.id,
        updated_by: actor.id,
      });
    } catch (error) {
      return {
        data: null,
        error: toServiceError('EVENT_QUICK_CREATE_VALIDATION_ERROR', 'Invalid quick event payload.', error),
      };
    }
  }

  async createEvent(actor: EventActorContext, input: EventCreateInput): Promise<ServiceResult<EventRow>> {
    try {
      if (!actor.is_active) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'Inactive users cannot create events.'),
        };
      }

      if (!hasPermission(actor, 'events.create') && !hasRoleAtLeast(actor, 'coordinator')) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You do not have permission to create events.'),
        };
      }

      const parsed = EventCreateSchema.parse(input);
      if (parsed.org_id !== actor.org_id) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You can only create events in your own organization.'),
        };
      }

      let status: EventStatus = parsed.status ?? 'draft';
      let setupStatus: EventSetupStatus = parsed.setup_status ?? (status === 'scheduled' || status === 'published' ? 'complete' : 'needs_details');
      let visibility: EventVisibility = parsed.visibility ?? (status === 'published' || parsed.is_public ? 'public' : 'internal');
      let isPublic = parsed.is_public ?? visibility === 'public';

      if (status === 'published') {
        if (!this.canPublishEvent(actor)) {
          return {
            data: null,
            error: toServiceError('PERMISSION_DENIED', 'You do not have permission to publish events.'),
          };
        }
        setupStatus = 'complete';
        visibility = 'public';
        isPublic = true;
      } else if (status === 'scheduled') {
        setupStatus = 'complete';
        visibility = 'internal';
        isPublic = false;
      } else if (status === 'plotted' || status === 'needs_details') {
        setupStatus = 'needs_details';
        visibility = 'internal';
        isPublic = false;
      }

      const eventForValidation: EventRow = {
        id: '00000000-0000-0000-0000-000000000000',
        org_id: parsed.org_id,
        title: parsed.title,
        address: parsed.address ?? null,
        type: parsed.type,
        event_date: parsed.event_date,
        start_time: parsed.start_time ?? null,
        end_time: parsed.end_time ?? null,
        description: parsed.description ?? null,
        image_url: parsed.image_url ?? null,
        extra_data: normalizeExtraData(parsed.extra_data),
        status,
        setup_status: setupStatus,
        setup_completed_at: parsed.setup_completed_at ?? null,
        creation_method: parsed.creation_method ?? 'manual',
        plotting_calendar_id: parsed.plotting_calendar_id ?? null,
        hosting_organization: parsed.hosting_organization ?? null,
        visibility,
        requested_by_user_id: parsed.requested_by_user_id ?? actor.id,
        requested_at: new Date().toISOString(),
        approved_at: null,
        rejected_at: null,
        rescheduled_at: null,
        completed_at: null,
        actual_collected_bags: null,
        actual_donors: null,
        wastage_units: null,
        post_event_notes: null,
        post_event_attachments: [],
        is_public: isPublic,
        coverage_area_id: parsed.coverage_area_id ?? null,
        coverage_area_psgc_code: parsed.coverage_area_psgc_code ?? null,
        coverage_area_boundary_id: parsed.coverage_area_boundary_id ?? null,
        coverage_area_name: parsed.coverage_area_name ?? null,
        coverage_area_province: parsed.coverage_area_province ?? null,
        coverage_area_municipality: parsed.coverage_area_municipality ?? null,
        coverage_area_barangay: parsed.coverage_area_barangay ?? null,
        coverage_area_normalized_key: (parsed.coverage_area_normalized_key ?? normalizeGeoAreaKey({
          region: null,
          province: parsed.coverage_area_province,
          municipality_or_city: parsed.coverage_area_municipality,
          barangay: parsed.coverage_area_barangay,
        })) || null,
        created_by: parsed.created_by ?? actor.id,
        updated_by: parsed.updated_by ?? actor.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (!eventForValidation.coverage_area_normalized_key) {
        eventForValidation.coverage_area_normalized_key = null; // Enforce null if empty string
      }

      eventForValidation.coverage_area_id = await this.autoMatchCoverageArea(parsed.org_id, eventForValidation);

      const windowCheck = await this.validateEventWindow(eventForValidation);
      if (windowCheck.error) {
        return { data: null, error: windowCheck.error };
      }

      if (status === 'scheduled' || status === 'published') {
        const readiness = await this.validatePublishReadiness(eventForValidation);
        if (readiness.error) {
          return { data: null, error: readiness.error };
        }
      }

      const { data, error } = await this.supabase
        .from('events')
        .insert({
          org_id: parsed.org_id,
          title: parsed.title,
          address: parsed.address ?? null,
          type: parsed.type,
          event_date: parsed.event_date,
          start_time: parsed.start_time ?? null,
          end_time: parsed.end_time ?? null,
          description: parsed.description ?? null,
          image_url: parsed.image_url ?? null,
          extra_data: normalizeExtraData(parsed.extra_data),
          status,
          setup_status: setupStatus,
          setup_completed_at: setupStatus === 'complete' ? (parsed.setup_completed_at ?? new Date().toISOString()) : null,
          creation_method: parsed.creation_method ?? 'manual',
          plotting_calendar_id: parsed.plotting_calendar_id ?? null,
          hosting_organization: parsed.hosting_organization ?? null,
          visibility,
          requested_by_user_id: parsed.requested_by_user_id ?? actor.id,
          is_public: isPublic,
          coverage_area_id: eventForValidation.coverage_area_id,
          coverage_area_psgc_code: eventForValidation.coverage_area_psgc_code,
          coverage_area_boundary_id: eventForValidation.coverage_area_boundary_id,
          coverage_area_name: eventForValidation.coverage_area_name,
          coverage_area_province: eventForValidation.coverage_area_province,
          coverage_area_municipality: eventForValidation.coverage_area_municipality,
          coverage_area_barangay: eventForValidation.coverage_area_barangay,
          coverage_area_normalized_key: eventForValidation.coverage_area_normalized_key,
          created_by: parsed.created_by ?? actor.id,
          updated_by: parsed.updated_by ?? actor.id,
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

      await this.createSystemLog({
        org_id: created.org_id,
        user_id: actor.id,
        action_type: created.creation_method === 'plotting_calendar' ? 'event_plotted' : 'event_created',
        entity_type: 'event',
        entity_id: created.id,
        payload: {
          status: created.status,
          event_date: created.event_date,
          type: created.type,
          creation_method: created.creation_method,
        },
        status: created.status,
      });

      await this.createNotification({
        org_id: created.org_id,
        user_id: created.requested_by_user_id,
        actor_user_id: actor.id,
        type: created.creation_method === 'plotting_calendar' ? 'event.plotted' : 'event.created',
        title: created.creation_method === 'plotting_calendar' ? 'Event plotted' : 'Event created',
        message: `${created.title} is now ${created.status.replace(/_/g, ' ')}.`,
        data: {
          event_id: created.id,
          status: created.status,
          creation_method: created.creation_method,
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

  async completeEventDetails(actor: EventActorContext, eventId: string, input: unknown): Promise<ServiceResult<EventRow>> {
    try {
      const parsed = CompleteEventDetailsSchema.parse(input);
      const existingResult = await this.getEventById(eventId, actor);
      if (existingResult.error || !existingResult.data) {
        return { data: null, error: existingResult.error };
      }

      const existing = existingResult.data;
      if (!this.canEditEvent(actor, existing)) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You do not have permission to complete this event setup.'),
        };
      }

      const extraData = {
        ...normalizeExtraData(existing.extra_data),
        ...(parsed.extra_data ?? {}),
      };

      const action = parsed.status_action ?? 'pending_setup';
      let status: EventStatus = existing.status;
      let setupStatus: EventSetupStatus = existing.setup_status;
      let visibility: EventVisibility = parsed.visibility ?? existing.visibility;
      let isPublic = parsed.is_public ?? existing.is_public;

      if (action === 'draft') {
        status = existing.creation_method === 'plotting_calendar' ? 'plotted' : 'draft';
        setupStatus = 'needs_details';
        visibility = 'internal';
        isPublic = false;
      } else if (action === 'pending_setup') {
        status = 'needs_details';
        setupStatus = 'pending_setup';
        visibility = 'internal';
        isPublic = false;
      } else if (action === 'scheduled') {
        status = 'scheduled';
        setupStatus = 'complete';
        visibility = 'internal';
        isPublic = false;
      } else if (action === 'publish') {
        if (!this.canPublishEvent(actor)) {
          return {
            data: null,
            error: toServiceError('PERMISSION_DENIED', 'You do not have permission to publish events.'),
          };
        }
        status = 'published';
        setupStatus = 'complete';
        visibility = 'public';
        isPublic = true;
        extraData.public_registration_enabled = true;
        extraData.allow_donor_signup = true;
      }

      const patch: EventUpdateInput = {
        title: parsed.title ?? existing.title,
        type: parsed.type ?? existing.type,
        event_date: parsed.event_date ?? existing.event_date,
        start_time: parsed.start_time !== undefined ? parsed.start_time : existing.start_time,
        end_time: parsed.end_time !== undefined ? parsed.end_time : existing.end_time,
        address: parsed.address !== undefined ? parsed.address : existing.address,
        description: parsed.description !== undefined ? parsed.description : existing.description,
        image_url: parsed.image_url !== undefined ? parsed.image_url : existing.image_url,
        coverage_area_id: parsed.coverage_area_id !== undefined ? parsed.coverage_area_id : existing.coverage_area_id,
        coverage_area_psgc_code: parsed.coverage_area_psgc_code !== undefined ? parsed.coverage_area_psgc_code : existing.coverage_area_psgc_code,
        coverage_area_boundary_id: parsed.coverage_area_boundary_id !== undefined ? parsed.coverage_area_boundary_id : existing.coverage_area_boundary_id,
        coverage_area_name: parsed.coverage_area_name !== undefined ? parsed.coverage_area_name : existing.coverage_area_name,
        coverage_area_province: parsed.coverage_area_province !== undefined ? parsed.coverage_area_province : existing.coverage_area_province,
        coverage_area_municipality: parsed.coverage_area_municipality !== undefined ? parsed.coverage_area_municipality : existing.coverage_area_municipality,
        coverage_area_barangay: parsed.coverage_area_barangay !== undefined ? parsed.coverage_area_barangay : existing.coverage_area_barangay,
        coverage_area_normalized_key: parsed.coverage_area_normalized_key !== undefined ? parsed.coverage_area_normalized_key : existing.coverage_area_normalized_key,
        extra_data: extraData,
        setup_status: setupStatus,
        setup_completed_at: setupStatus === 'complete' ? (existing.setup_completed_at ?? new Date().toISOString()) : null,
        status,
        visibility,
        is_public: isPublic,
        hosting_organization: parsed.hosting_organization !== undefined ? parsed.hosting_organization : existing.hosting_organization,
        updated_by: actor.id,
      };

      const candidate: EventRow = {
        ...existing,
        ...patch,
        extra_data: patch.extra_data ?? existing.extra_data,
        status: patch.status ?? existing.status,
        setup_status: patch.setup_status ?? existing.setup_status,
        setup_completed_at: patch.setup_completed_at ?? existing.setup_completed_at,
        visibility: patch.visibility ?? existing.visibility,
        is_public: patch.is_public ?? existing.is_public,
        hosting_organization: patch.hosting_organization ?? existing.hosting_organization,
      };

      candidate.coverage_area_id = await this.autoMatchCoverageArea(actor.org_id, candidate);
      patch.coverage_area_id = candidate.coverage_area_id;

      if (!canTransitionEventStatus(existing.status, candidate.status)) {
        return {
          data: null,
          error: toServiceError('INVALID_STATUS_TRANSITION', `Invalid status transition: ${existing.status} -> ${candidate.status}.`),
        };
      }

      const windowCheck = await this.validateEventWindow(candidate);
      if (windowCheck.error) {
        return { data: null, error: windowCheck.error };
      }

      if (candidate.status === 'scheduled' || candidate.status === 'published') {
        const readiness = await this.validatePublishReadiness(candidate);
        if (readiness.error) {
          return { data: null, error: readiness.error };
        }
      }

      const { data, error } = await this.supabase
        .from('events')
        .update(patch)
        .eq('id', eventId)
        .eq('org_id', actor.org_id)
        .select('*')
        .single();

      if (error || !data) {
        return {
          data: null,
          error: toServiceError('EVENT_COMPLETE_DETAILS_FAILED', 'Failed to save event setup details.', error),
        };
      }

      const updated = data as EventRow;

      if (parsed.assigned_staff_ids) {
        const staffSync = await this.syncAssignedStaff({
          event: updated,
          actor,
          userIds: parsed.assigned_staff_ids,
        });

        if (staffSync.error) {
          return { data: null, error: staffSync.error };
        }
      }

      await this.createSystemLog({
        org_id: updated.org_id,
        user_id: actor.id,
        action_type: updated.status === 'published' ? 'event_published' : 'event_details_completed',
        entity_type: 'event',
        entity_id: updated.id,
        payload: {
          before_setup_status: existing.setup_status,
          after_setup_status: updated.setup_status,
          before_status: existing.status,
          after_status: updated.status,
          action,
        },
        status: updated.status,
      });

      await this.createNotification({
        org_id: updated.org_id,
        user_id: updated.requested_by_user_id,
        actor_user_id: actor.id,
        type: updated.status === 'published' ? 'event.published' : 'event.setup_updated',
        title: updated.status === 'published' ? 'Event published' : 'Event details updated',
        message: `${updated.title} is now ${updated.status.replace(/_/g, ' ')}.`,
        data: {
          event_id: updated.id,
          status: updated.status,
          setup_status: updated.setup_status,
        },
      });

      return { data: updated, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('EVENT_COMPLETE_DETAILS_VALIDATION_ERROR', 'Invalid complete details payload.', error),
      };
    }
  }

  async setEventStatus(
    actor: EventActorContext,
    eventId: string,
    input: Omit<EventStatusUpdateInput, 'event_id'>
  ): Promise<ServiceResult<EventRow>> {
    try {
      const parsed = EventStatusUpdateSchema.parse({ event_id: eventId, ...input });
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

      if (!this.canEditEvent(actor, existing)) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You do not have permission to update this event status.'),
        };
      }

      if (!canTransitionEventStatus(existing.status, parsed.status)) {
        return {
          data: null,
          error: toServiceError('INVALID_STATUS_TRANSITION', `Invalid status transition: ${existing.status} -> ${parsed.status}.`),
        };
      }

      let setupStatus = existing.setup_status;
      let visibility = existing.visibility;
      let isPublic = existing.is_public;

      if (parsed.status === 'scheduled') {
        setupStatus = 'complete';
        visibility = 'internal';
        isPublic = false;
      } else if (parsed.status === 'published') {
        if (!this.canPublishEvent(actor)) {
          return {
            data: null,
            error: toServiceError('PERMISSION_DENIED', 'You do not have permission to publish events.'),
          };
        }
        setupStatus = 'complete';
        visibility = 'public';
        isPublic = true;
      } else if (parsed.status === 'cancelled') {
        if (!this.canCancelEvent(actor)) {
          return {
            data: null,
            error: toServiceError('PERMISSION_DENIED', 'You do not have permission to cancel events.'),
          };
        }
      }

      const candidate: EventRow = {
        ...existing,
        status: parsed.status,
        setup_status: setupStatus,
        visibility,
        is_public: isPublic,
      };

      if (parsed.status === 'scheduled' || parsed.status === 'published') {
        const readiness = await this.validatePublishReadiness(candidate);
        if (readiness.error) {
          return { data: null, error: readiness.error };
        }
      }

      const { data, error } = await this.supabase
        .from('events')
        .update({
          status: parsed.status,
          setup_status: setupStatus,
          visibility,
          is_public: isPublic,
          updated_by: actor.id,
        })
        .eq('id', eventId)
        .eq('org_id', actor.org_id)
        .select('*')
        .single();

      if (error || !data) {
        return {
          data: null,
          error: toServiceError('EVENT_STATUS_UPDATE_FAILED', 'Failed to update event status.', error),
        };
      }

      const updated = data as EventRow;
      await this.createSystemLog({
        org_id: updated.org_id,
        user_id: actor.id,
        action_type: 'event_status_updated',
        entity_type: 'event',
        entity_id: updated.id,
        payload: {
          before_status: existing.status,
          after_status: updated.status,
          notes: parsed.notes ?? null,
        },
        status: updated.status,
        notes: parsed.notes ?? undefined,
      });

      await this.createNotification({
        org_id: updated.org_id,
        user_id: updated.requested_by_user_id,
        actor_user_id: actor.id,
        type: 'event.status_updated',
        title: 'Event status updated',
        message: `${updated.title} changed from ${existing.status} to ${updated.status}.`,
        data: {
          event_id: updated.id,
          from_status: existing.status,
          to_status: updated.status,
        },
      });

      return { data: updated, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('EVENT_STATUS_UPDATE_VALIDATION_ERROR', 'Invalid event status payload.', error),
      };
    }
  }

  async publishEvent(actor: EventActorContext, eventId: string): Promise<ServiceResult<EventRow>> {
    return this.setEventStatus(actor, eventId, { status: 'published' });
  }

  async updateEvent(actor: EventActorContext, eventId: string, input: EventUpdateInput): Promise<ServiceResult<EventRow>> {
    try {
      const parsed = EventUpdateSchema.parse(input);
      const existingResult = await this.getEventById(eventId, actor);
      if (existingResult.error || !existingResult.data) {
        return { data: null, error: existingResult.error };
      }

      const existing = existingResult.data;
      if (!this.canEditEvent(actor, existing)) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You do not have permission to update this event.'),
        };
      }

      const mergedExtraData = parsed.extra_data
        ? { ...normalizeExtraData(existing.extra_data), ...normalizeExtraData(parsed.extra_data) }
        : existing.extra_data;

      const nextStatus = parsed.status ?? existing.status;
      if (!canTransitionEventStatus(existing.status, nextStatus)) {
        return {
          data: null,
          error: toServiceError('INVALID_STATUS_TRANSITION', `Invalid status transition: ${existing.status} -> ${nextStatus}.`),
        };
      }

      const candidate: EventRow = {
        ...existing,
        ...parsed,
        status: nextStatus,
        extra_data: mergedExtraData,
        visibility: parsed.visibility ?? existing.visibility,
        is_public: parsed.is_public ?? existing.is_public,
        coverage_area_id: parsed.coverage_area_id !== undefined ? parsed.coverage_area_id : existing.coverage_area_id,
        coverage_area_psgc_code: parsed.coverage_area_psgc_code !== undefined ? parsed.coverage_area_psgc_code : existing.coverage_area_psgc_code,
        coverage_area_boundary_id: parsed.coverage_area_boundary_id !== undefined ? parsed.coverage_area_boundary_id : existing.coverage_area_boundary_id,
        coverage_area_name: parsed.coverage_area_name !== undefined ? parsed.coverage_area_name : existing.coverage_area_name,
        coverage_area_province: parsed.coverage_area_province !== undefined ? parsed.coverage_area_province : existing.coverage_area_province,
        coverage_area_municipality: parsed.coverage_area_municipality !== undefined ? parsed.coverage_area_municipality : existing.coverage_area_municipality,
        coverage_area_barangay: parsed.coverage_area_barangay !== undefined ? parsed.coverage_area_barangay : existing.coverage_area_barangay,
        coverage_area_normalized_key: parsed.coverage_area_normalized_key !== undefined ? parsed.coverage_area_normalized_key : existing.coverage_area_normalized_key,
      };

      if (parsed.coverage_area_province !== undefined || parsed.coverage_area_municipality !== undefined || parsed.coverage_area_barangay !== undefined) {
        if (!candidate.coverage_area_normalized_key) {
           candidate.coverage_area_normalized_key = normalizeGeoAreaKey({
             region: null,
             province: candidate.coverage_area_province,
             municipality_or_city: candidate.coverage_area_municipality,
             barangay: candidate.coverage_area_barangay,
           }) || null;
           parsed.coverage_area_normalized_key = candidate.coverage_area_normalized_key;
        }
      }

      candidate.coverage_area_id = await this.autoMatchCoverageArea(actor.org_id, candidate);
      parsed.coverage_area_id = candidate.coverage_area_id;

      const windowCheck = await this.validateEventWindow(candidate);
      if (windowCheck.error) {
        return { data: null, error: windowCheck.error };
      }

      if (candidate.status === 'scheduled' || candidate.status === 'published') {
        const readiness = await this.validatePublishReadiness(candidate);
        if (readiness.error) {
          return { data: null, error: readiness.error };
        }
      }

      const patch: EventUpdateInput = {
        ...parsed,
        extra_data: mergedExtraData,
        updated_by: actor.id,
      };

      const { data, error } = await this.supabase
        .from('events')
        .update(patch)
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
      hasRoleAtLeast(actor, 'admin') ||
      hasPermission(actor, 'events.delete') ||
      hasPermission(actor, 'events.update');

    if (!canDelete) {
      return {
        data: null,
        error: toServiceError('PERMISSION_DENIED', 'You do not have permission to delete this event.'),
      };
    }

    if (!['draft', 'plotted', 'needs_details', 'cancelled'].includes(existing.status)) {
      return {
        data: null,
        error: toServiceError('INVALID_STATUS_TRANSITION', 'Only draft, plotted, needs details, or cancelled events can be deleted.'),
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

      query = parsed.org_id ? query.eq('org_id', parsed.org_id) : query.eq('org_id', actor.org_id);

      if (parsed.statuses?.length) {
        query = query.in('status', parsed.statuses);
      }

      if (parsed.setup_statuses?.length) {
        query = query.in('setup_status', parsed.setup_statuses);
      }

      if (parsed.creation_methods?.length) {
        query = query.in('creation_method', parsed.creation_methods);
      }

      if (parsed.types?.length) {
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

      if (parsed.hosting_organization) {
        query = query.ilike('hosting_organization', `%${parsed.hosting_organization}%`);
      }

      const { data, error } = await query;
      if (error) {
        return {
          data: null,
          error: toServiceError('EVENT_LIST_FAILED', 'Failed to list events.', error),
        };
      }

      const rows = ((data ?? []) as EventRow[]).filter((event) => this.canViewOrgEvent(actor, event));
      let result = rows;

      if (parsed.include_public) {
        const { data: publicRows, error: publicError } = await this.supabase
          .from('events')
          .select('*')
          .eq('status', 'published')
          .eq('setup_status', 'complete')
          .or('visibility.eq.public,is_public.eq.true')
          .neq('org_id', actor.org_id);

        if (publicError) {
          return {
            data: null,
            error: toServiceError('PUBLIC_EVENT_LIST_FAILED', 'Failed to fetch public events.', publicError),
          };
        }

        result = [...result, ...((publicRows ?? []) as EventRow[])];
      }

      if (parsed.search) {
        const q = parsed.search.toLowerCase();
        result = result.filter((event) => {
          const extra = normalizeExtraData(event.extra_data);
          const haystack = [
            buildEventSearchText(event),
            event.hosting_organization ?? '',
            extraValueToString(extra, 'campaign_title'),
            extraValueToString(extra, 'campaign_description'),
          ]
            .join(' ')
            .toLowerCase();

          return haystack.includes(q);
        });
      }

      const deduped = Array.from(new Map(result.map((event) => [event.id, event])).values());
      const enriched = await this.enrichEvents(deduped);
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
        .eq('status', 'published')
        .eq('setup_status', 'complete')
        .or('visibility.eq.public,is_public.eq.true')
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true })
        .range(offset, offset + limit - 1);

      if (parsed.from_date) {
        query = query.gte('event_date', parsed.from_date);
      }

      if (parsed.to_date) {
        query = query.lte('event_date', parsed.to_date);
      }

      if (parsed.types?.length) {
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

      if (parsed.province) {
        const province = parsed.province.trim().toLowerCase();
        rows = rows.filter((event) => extraValueToString(event.extra_data, 'province').toLowerCase() === province);
      }

      if (parsed.city) {
        const city = parsed.city.trim().toLowerCase();
        rows = rows.filter((event) => {
          const eventCity =
            extraValueToString(event.extra_data, 'city') ||
            extraValueToString(event.extra_data, 'municipality') ||
            extraValueToString(event.extra_data, 'location');
          return eventCity.toLowerCase() === city;
        });
      }

      if (parsed.search) {
        const q = parsed.search.toLowerCase();
        rows = rows.filter((event) => {
          const extra = normalizeExtraData(event.extra_data);
          const haystack = [
            buildEventSearchText(event),
            extraValueToString(extra, 'campaign_title'),
            extraValueToString(extra, 'campaign_description'),
            event.hosting_organization ?? '',
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(q);
        });
      }

      return { data: rows, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('PUBLIC_EVENT_FILTER_INVALID', 'Invalid public event filter.', error),
      };
    }
  }

  async cancelPublishedEvent(
    actor: EventActorContext,
    eventId: string,
    notes?: string | null
  ): Promise<ServiceResult<EventRow>> {
    return this.setEventStatus(actor, eventId, {
      status: 'cancelled',
      notes,
    });
  }

  subscribeToEventUpdates(orgId: string, handlers: EventSubscriptionHandlers): RealtimeChannel {
    const channel = this.supabase.channel(`events:${orgId}`);

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'events',
        filter: `org_id=eq.${orgId}`,
      },
      (payload) => {
        if (payload.eventType === 'INSERT' && handlers.onInsert) {
          handlers.onInsert(payload.new as EventRow);
        } else if (payload.eventType === 'UPDATE' && handlers.onUpdate) {
          handlers.onUpdate(payload.new as EventRow);
        } else if (payload.eventType === 'DELETE' && handlers.onDelete) {
          handlers.onDelete(payload.old as Pick<EventRow, 'id' | 'org_id'>);
        }
      }
    );

    void channel.subscribe();
    return channel;
  }
}
