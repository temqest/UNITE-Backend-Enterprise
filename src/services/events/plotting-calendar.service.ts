import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EventRow,
  EventType,
  PlottingCalendarCreateInput,
  PlottingCalendarRow,
  PlottingCalendarStatus,
  PlottingCalendarUpdateInput,
} from '../../models/events/types';
import type { EventActorContext, PlottingCalendarFilter, ServiceResult } from './event.types';
import { hasPermission, hasRoleAtLeast, toServiceError } from './event.types';
import { EventService } from './event.service';

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/);
const slotSchema = z.object({
  label: z.string().trim().optional(),
  start_time: timeSchema,
  end_time: timeSchema,
}).superRefine((value, context) => {
  if (value.start_time >= value.end_time) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_time'],
      message: 'end_time must be later than start_time.',
    });
  }
});

const calendarStatusSchema = z.enum(['active', 'inactive', 'expired', 'archived']);
const accessTypeSchema = z.enum(['org', 'users', 'organizations', 'share_token']);

const PlottingCalendarCreateSchema = z.object({
  org_id: z.string().uuid(),
  title: z.string().trim().min(3),
  description: z.string().trim().optional().nullable(),
  allowed_dates: z.array(z.string().date()).min(1),
  allowed_time_slots: z.array(slotSchema).min(1),
  allowed_event_types: z.array(z.enum(['blood_drive', 'training', 'advocacy', 'assembly'])).min(1),
  max_events_per_date: z.number().int().positive().optional().nullable(),
  max_events_per_slot: z.number().int().positive().optional().nullable(),
  access_type: accessTypeSchema.optional(),
  allowed_user_ids: z.array(z.string().uuid()).optional(),
  allowed_organization_ids: z.array(z.string().uuid()).optional(),
  share_token: z.string().trim().optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
  status: calendarStatusSchema.optional(),
  created_by: z.string().uuid().optional().nullable(),
});

const PlottingCalendarUpdateSchema = z.object({
  title: z.string().trim().min(3).optional(),
  description: z.string().trim().optional().nullable(),
  allowed_dates: z.array(z.string().date()).optional(),
  allowed_time_slots: z.array(slotSchema).optional(),
  allowed_event_types: z.array(z.enum(['blood_drive', 'training', 'advocacy', 'assembly'])).optional(),
  max_events_per_date: z.number().int().positive().optional().nullable(),
  max_events_per_slot: z.number().int().positive().optional().nullable(),
  access_type: accessTypeSchema.optional(),
  allowed_user_ids: z.array(z.string().uuid()).optional(),
  allowed_organization_ids: z.array(z.string().uuid()).optional(),
  share_token: z.string().trim().optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
  status: calendarStatusSchema.optional(),
});

const PlottingCalendarFilterSchema = z.object({
  org_id: z.string().uuid().optional(),
  statuses: z.array(calendarStatusSchema).optional(),
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

const PlotEventSchema = z.object({
  title: z.string().trim().min(3),
  type: z.enum(['blood_drive', 'training', 'advocacy', 'assembly']),
  event_date: z.string().date(),
  start_time: timeSchema,
  end_time: timeSchema,
  address: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  hosting_organization: z.string().trim().optional().nullable(),
  extra_data: z.record(z.string(), z.unknown()).optional(),
}).superRefine((value, context) => {
  if (value.start_time >= value.end_time) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_time'],
      message: 'end_time must be later than start_time.',
    });
  }
});

interface SlotAvailability {
  event_date: string;
  slot: {
    label?: string;
    start_time: string;
    end_time: string;
  };
  current_events: number;
  date_events: number;
  remaining_slot_capacity: number | null;
  remaining_date_capacity: number | null;
  available: boolean;
}

function normalizeCalendarRow(row: Record<string, unknown>): PlottingCalendarRow {
  return {
    id: String(row.id),
    org_id: String(row.org_id),
    title: String(row.title),
    description: typeof row.description === 'string' ? row.description : null,
    allowed_dates: Array.isArray(row.allowed_dates) ? row.allowed_dates.map(String) : [],
    allowed_time_slots: Array.isArray(row.allowed_time_slots)
      ? row.allowed_time_slots.map((slot) => {
          const record = slot && typeof slot === 'object' && !Array.isArray(slot)
            ? (slot as Record<string, unknown>)
            : {};

          return {
            label: typeof record.label === 'string' ? record.label : undefined,
            start_time: String(record.start_time ?? ''),
            end_time: String(record.end_time ?? ''),
          };
        })
      : [],
    allowed_event_types: Array.isArray(row.allowed_event_types) ? row.allowed_event_types.map((type) => String(type) as EventType) : [],
    max_events_per_date: typeof row.max_events_per_date === 'number' ? row.max_events_per_date : null,
    max_events_per_slot: typeof row.max_events_per_slot === 'number' ? row.max_events_per_slot : null,
    access_type: (String(row.access_type || 'org') as PlottingCalendarRow['access_type']),
    allowed_user_ids: Array.isArray(row.allowed_user_ids) ? row.allowed_user_ids.map(String) : [],
    allowed_organization_ids: Array.isArray(row.allowed_organization_ids) ? row.allowed_organization_ids.map(String) : [],
    share_token: typeof row.share_token === 'string' ? row.share_token : null,
    expires_at: typeof row.expires_at === 'string' ? row.expires_at : null,
    status: (String(row.status || 'active') as PlottingCalendarStatus),
    created_by: typeof row.created_by === 'string' ? row.created_by : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export class PlottingCalendarService {
  private readonly eventService: EventService;

  constructor(private readonly supabase: SupabaseClient) {
    this.eventService = new EventService(supabase);
  }

  private canManage(actor: EventActorContext): boolean {
    return (
      hasRoleAtLeast(actor, 'coordinator') ||
      (hasPermission(actor, 'events.create') && hasPermission(actor, 'events.update'))
    );
  }

  private canRead(actor: EventActorContext): boolean {
    return hasRoleAtLeast(actor, 'staff') || hasPermission(actor, 'events.read');
  }

  private hasCalendarAccess(actor: EventActorContext, calendar: PlottingCalendarRow): boolean {
    if (calendar.org_id !== actor.org_id || !this.canRead(actor)) {
      return false;
    }

    if (this.canManage(actor) || hasRoleAtLeast(actor, 'admin')) {
      return true;
    }

    if (calendar.access_type === 'org' || calendar.access_type === 'share_token') {
      return true;
    }

    if (calendar.access_type === 'users') {
      return calendar.allowed_user_ids.includes(actor.id);
    }

    if (calendar.access_type === 'organizations') {
      return calendar.allowed_organization_ids.includes(actor.org_id);
    }

    return false;
  }

  private isExpired(calendar: PlottingCalendarRow): boolean {
    return Boolean(calendar.expires_at && Date.parse(calendar.expires_at) < Date.now());
  }

  private async getCalendarRaw(calendarId: string): Promise<ServiceResult<PlottingCalendarRow>> {
    const { data, error } = await this.supabase
      .from('plotting_calendars')
      .select('*')
      .eq('id', calendarId)
      .single();

    if (error || !data) {
      return {
        data: null,
        error: toServiceError('PLOTTING_CALENDAR_NOT_FOUND', 'Plotting calendar was not found.', error),
      };
    }

    return { data: normalizeCalendarRow(data as Record<string, unknown>), error: null };
  }

  private async getActiveEventsForCalendar(calendar: PlottingCalendarRow): Promise<ServiceResult<EventRow[]>> {
    const { data, error } = await this.supabase
      .from('events')
      .select('*')
      .eq('org_id', calendar.org_id)
      .neq('status', 'cancelled')
      .neq('status', 'completed')
      .or(`plotting_calendar_id.eq.${calendar.id},and(event_date.in.(${calendar.allowed_dates.join(',')}),creation_method.eq.plotting_calendar)`);

    if (error) {
      return {
        data: null,
        error: toServiceError('PLOTTING_CALENDAR_EVENTS_LOOKUP_FAILED', 'Failed to load plotted events.', error),
      };
    }

    return { data: (data as EventRow[]) ?? [], error: null };
  }

  async listCalendars(actor: EventActorContext, filter: PlottingCalendarFilter = {}): Promise<ServiceResult<PlottingCalendarRow[]>> {
    try {
      const parsed = PlottingCalendarFilterSchema.parse(filter);
      let query = this.supabase
        .from('plotting_calendars')
        .select('*')
        .eq('org_id', parsed.org_id ?? actor.org_id)
        .order('created_at', { ascending: false });

      if (parsed.statuses?.length) {
        query = query.in('status', parsed.statuses);
      }

      if (parsed.limit != null && parsed.offset != null) {
        query = query.range(parsed.offset, parsed.offset + parsed.limit - 1);
      }

      const { data, error } = await query;
      if (error) {
        return {
          data: null,
          error: toServiceError('PLOTTING_CALENDAR_LIST_FAILED', 'Failed to list plotting calendars.', error),
        };
      }

      let rows = ((data ?? []) as Array<Record<string, unknown>>).map(normalizeCalendarRow);
      rows = rows.filter((calendar) => this.hasCalendarAccess(actor, calendar));

      if (parsed.search) {
        const q = parsed.search.toLowerCase();
        rows = rows.filter((calendar) =>
          `${calendar.title} ${calendar.description ?? ''}`.toLowerCase().includes(q)
        );
      }

      return { data: rows, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('PLOTTING_CALENDAR_FILTER_INVALID', 'Invalid plotting calendar filter.', error),
      };
    }
  }

  async getCalendar(actor: EventActorContext, calendarId: string): Promise<ServiceResult<PlottingCalendarRow>> {
    const calendarResult = await this.getCalendarRaw(calendarId);
    if (calendarResult.error || !calendarResult.data) {
      return { data: null, error: calendarResult.error };
    }

    if (!this.hasCalendarAccess(actor, calendarResult.data)) {
      return {
        data: null,
        error: toServiceError('PERMISSION_DENIED', 'You do not have access to this plotting calendar.'),
      };
    }

    return calendarResult;
  }

  async createCalendar(actor: EventActorContext, input: PlottingCalendarCreateInput): Promise<ServiceResult<PlottingCalendarRow>> {
    try {
      if (!this.canManage(actor)) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You do not have permission to manage plotting calendars.'),
        };
      }

      const parsed = PlottingCalendarCreateSchema.parse(input);
      if (parsed.org_id !== actor.org_id) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You can only create calendars in your own organization.'),
        };
      }

      const { data, error } = await this.supabase
        .from('plotting_calendars')
        .insert({
          ...parsed,
          created_by: parsed.created_by ?? actor.id,
          access_type: parsed.access_type ?? 'org',
          status: parsed.status ?? 'active',
          allowed_user_ids: parsed.allowed_user_ids ?? [],
          allowed_organization_ids: parsed.allowed_organization_ids ?? [],
        })
        .select('*')
        .single();

      if (error || !data) {
        return {
          data: null,
          error: toServiceError('PLOTTING_CALENDAR_CREATE_FAILED', 'Failed to create plotting calendar.', error),
        };
      }

      return { data: normalizeCalendarRow(data as Record<string, unknown>), error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('PLOTTING_CALENDAR_CREATE_VALIDATION_ERROR', 'Invalid plotting calendar payload.', error),
      };
    }
  }

  async updateCalendar(actor: EventActorContext, calendarId: string, input: PlottingCalendarUpdateInput): Promise<ServiceResult<PlottingCalendarRow>> {
    try {
      if (!this.canManage(actor)) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You do not have permission to manage plotting calendars.'),
        };
      }

      const existingResult = await this.getCalendar(actor, calendarId);
      if (existingResult.error || !existingResult.data) {
        return { data: null, error: existingResult.error };
      }

      const parsed = PlottingCalendarUpdateSchema.parse(input);
      const { data, error } = await this.supabase
        .from('plotting_calendars')
        .update(parsed)
        .eq('id', calendarId)
        .eq('org_id', actor.org_id)
        .select('*')
        .single();

      if (error || !data) {
        return {
          data: null,
          error: toServiceError('PLOTTING_CALENDAR_UPDATE_FAILED', 'Failed to update plotting calendar.', error),
        };
      }

      return { data: normalizeCalendarRow(data as Record<string, unknown>), error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('PLOTTING_CALENDAR_UPDATE_VALIDATION_ERROR', 'Invalid plotting calendar update payload.', error),
      };
    }
  }

  async deleteCalendar(actor: EventActorContext, calendarId: string): Promise<ServiceResult<true>> {
    if (!this.canManage(actor)) {
      return {
        data: null,
        error: toServiceError('PERMISSION_DENIED', 'You do not have permission to delete plotting calendars.'),
      };
    }

    const existingResult = await this.getCalendar(actor, calendarId);
    if (existingResult.error || !existingResult.data) {
      return { data: null, error: existingResult.error };
    }

    const { error } = await this.supabase
      .from('plotting_calendars')
      .delete()
      .eq('id', calendarId)
      .eq('org_id', actor.org_id);

    if (error) {
      return {
        data: null,
        error: toServiceError('PLOTTING_CALENDAR_DELETE_FAILED', 'Failed to delete plotting calendar.', error),
      };
    }

    return { data: true, error: null };
  }

  async getAvailableSlots(actor: EventActorContext, calendarId: string): Promise<ServiceResult<SlotAvailability[]>> {
    const calendarResult = await this.getCalendar(actor, calendarId);
    if (calendarResult.error || !calendarResult.data) {
      return { data: null, error: calendarResult.error };
    }

    const calendar = calendarResult.data;
    const eventResult = await this.getActiveEventsForCalendar(calendar);
    if (eventResult.error || !eventResult.data) {
      return { data: null, error: eventResult.error };
    }

    const items: SlotAvailability[] = [];
    for (const eventDate of calendar.allowed_dates) {
      const sameDayEvents = eventResult.data.filter((event) => event.event_date === eventDate);
      for (const slot of calendar.allowed_time_slots) {
        const currentEvents = sameDayEvents.filter(
          (event) => event.start_time === slot.start_time && event.end_time === slot.end_time
        ).length;

        const remainingSlotCapacity =
          calendar.max_events_per_slot != null ? Math.max(calendar.max_events_per_slot - currentEvents, 0) : null;
        const remainingDateCapacity =
          calendar.max_events_per_date != null ? Math.max(calendar.max_events_per_date - sameDayEvents.length, 0) : null;

        items.push({
          event_date: eventDate,
          slot,
          current_events: currentEvents,
          date_events: sameDayEvents.length,
          remaining_slot_capacity: remainingSlotCapacity,
          remaining_date_capacity: remainingDateCapacity,
          available:
            (remainingSlotCapacity == null || remainingSlotCapacity > 0) &&
            (remainingDateCapacity == null || remainingDateCapacity > 0),
        });
      }
    }

    return { data: items, error: null };
  }

  async plotEvent(actor: EventActorContext, calendarId: string, input: unknown): Promise<ServiceResult<EventRow>> {
    try {
      if (!hasPermission(actor, 'events.create') && !hasRoleAtLeast(actor, 'coordinator')) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You do not have permission to plot events.'),
        };
      }

      const calendarResult = await this.getCalendar(actor, calendarId);
      if (calendarResult.error || !calendarResult.data) {
        return { data: null, error: calendarResult.error };
      }

      const calendar = calendarResult.data;
      if (calendar.status !== 'active') {
        return {
          data: null,
          error: toServiceError('PLOTTING_CALENDAR_INACTIVE', 'Plotting calendar is not active.'),
        };
      }

      if (this.isExpired(calendar)) {
        return {
          data: null,
          error: toServiceError('PLOTTING_CALENDAR_EXPIRED', 'Plotting calendar has expired.'),
        };
      }

      const parsed = PlotEventSchema.parse(input);
      if (!calendar.allowed_dates.includes(parsed.event_date)) {
        return {
          data: null,
          error: toServiceError('PLOTTING_DATE_NOT_ALLOWED', 'Selected date is not available on this plotting calendar.'),
        };
      }

      if (!calendar.allowed_event_types.includes(parsed.type)) {
        return {
          data: null,
          error: toServiceError('PLOTTING_TYPE_NOT_ALLOWED', 'Selected event type is not available on this plotting calendar.'),
        };
      }

      const matchingSlot = calendar.allowed_time_slots.find(
        (slot) => slot.start_time === parsed.start_time && slot.end_time === parsed.end_time
      );

      if (!matchingSlot) {
        return {
          data: null,
          error: toServiceError('PLOTTING_SLOT_NOT_ALLOWED', 'Selected time slot is not available on this plotting calendar.'),
        };
      }

      const availabilityResult = await this.getAvailableSlots(actor, calendarId);
      if (availabilityResult.error || !availabilityResult.data) {
        return { data: null, error: availabilityResult.error };
      }

      const targetAvailability = availabilityResult.data.find(
        (item) =>
          item.event_date === parsed.event_date &&
          item.slot.start_time === parsed.start_time &&
          item.slot.end_time === parsed.end_time
      );

      if (!targetAvailability?.available) {
        return {
          data: null,
          error: toServiceError('PLOTTING_SLOT_FULL', 'The selected plotting calendar slot is already full.'),
        };
      }

      return this.eventService.createEvent(actor, {
        org_id: actor.org_id,
        title: parsed.title,
        address: parsed.address ?? null,
        type: parsed.type,
        event_date: parsed.event_date,
        start_time: parsed.start_time,
        end_time: parsed.end_time,
        description: parsed.description ?? null,
        extra_data: {
          ...(parsed.extra_data ?? {}),
          plotted_from_calendar: true,
          plotting_calendar_title: calendar.title,
        },
        status: 'plotted',
        setup_status: 'needs_details',
        creation_method: 'plotting_calendar',
        plotting_calendar_id: calendar.id,
        hosting_organization: parsed.hosting_organization ?? calendar.title,
        visibility: 'internal',
        requested_by_user_id: actor.id,
        is_public: false,
        created_by: actor.id,
        updated_by: actor.id,
      });
    } catch (error) {
      return {
        data: null,
        error: toServiceError('PLOTTING_EVENT_VALIDATION_ERROR', 'Invalid plotting event payload.', error),
      };
    }
  }
}
