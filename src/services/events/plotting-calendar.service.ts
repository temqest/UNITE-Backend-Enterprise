import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EventRow,
  EventType,
  PlottingCalendarAvailabilityInput,
  PlottingCalendarDayRow,
  PlottingCalendarDayStatus,
  PlottingCalendarCreateInput,
  PlottingCalendarRow,
  PlottingCalendarSlotStatus,
  PlottingCalendarStatus,
  PlottingCalendarTimeSlotRow,
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

const calendarStatusSchema = z.enum(['active', 'closed', 'expired', 'archived']);
const accessTypeSchema = z.enum(['org', 'users', 'organizations', 'share_token']);
const dayStatusSchema = z.enum(['open', 'unavailable', 'fully_booked']);
const slotStatusSchema = z.enum(['open', 'unavailable', 'fully_booked']);

const PlottingCalendarCreateSchema = z.object({
  org_id: z.string().uuid(),
  title: z.string().trim().min(3),
  description: z.string().trim().optional().nullable(),
  allowed_dates: z.array(z.string().date()).optional().default([]),
  allowed_time_slots: z.array(slotSchema).optional().default([]),
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

const AvailabilityRangeSchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

const AvailabilitySlotSchema = z.object({
  label: z.string().trim().optional().nullable(),
  starts_at: timeSchema,
  ends_at: timeSchema,
  status: slotStatusSchema.optional(),
  max_events_for_slot: z.number().int().positive().optional().nullable(),
}).superRefine((value, context) => {
  if (value.starts_at >= value.ends_at) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ends_at'],
      message: 'ends_at must be later than starts_at.',
    });
  }
});

const AvailabilityDaySchema = z.object({
  date: z.string().date(),
  status: dayStatusSchema.optional(),
  max_events_for_day: z.number().int().positive().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  slots: z.array(AvailabilitySlotSchema).optional(),
});

const AvailabilityUpdateSchema = z.object({
  days: z.array(AvailabilityDaySchema).min(1),
  replace_existing: z.boolean().optional(),
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
  day_id?: string;
  slot_id?: string;
  event_date: string;
  day_status?: PlottingCalendarDayStatus;
  slot_status?: PlottingCalendarSlotStatus;
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

interface CalendarAvailabilitySlot extends PlottingCalendarTimeSlotRow {
  current_events: number;
  remaining_slot_capacity: number | null;
  available: boolean;
}

interface CalendarAvailabilityDay extends PlottingCalendarDayRow {
  date_events: number;
  remaining_day_capacity: number | null;
  available: boolean;
  slots: CalendarAvailabilitySlot[];
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

function normalizeDayRow(row: Record<string, unknown>): PlottingCalendarDayRow {
  return {
    id: String(row.id),
    plotting_calendar_id: String(row.plotting_calendar_id),
    date: String(row.date),
    status: String(row.status || 'open') as PlottingCalendarDayStatus,
    max_events_for_day: typeof row.max_events_for_day === 'number' ? row.max_events_for_day : null,
    notes: typeof row.notes === 'string' ? row.notes : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeTimeSlotRow(row: Record<string, unknown>): PlottingCalendarTimeSlotRow {
  return {
    id: String(row.id),
    plotting_calendar_day_id: String(row.plotting_calendar_day_id),
    starts_at: String(row.starts_at),
    ends_at: String(row.ends_at),
    label: typeof row.label === 'string' ? row.label : null,
    status: String(row.status || 'open') as PlottingCalendarSlotStatus,
    max_events_for_slot: typeof row.max_events_for_slot === 'number' ? row.max_events_for_slot : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function stripSeconds(value: string | null | undefined): string {
  return String(value ?? '').slice(0, 5);
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

  private async getActiveEventsForCalendar(calendar: PlottingCalendarRow, from?: string, to?: string): Promise<ServiceResult<EventRow[]>> {
    let query = this.supabase
      .from('events')
      .select('*')
      .eq('org_id', calendar.org_id)
      .neq('status', 'cancelled')
      .neq('status', 'completed')
      .eq('plotting_calendar_id', calendar.id);

    if (from) {
      query = query.gte('event_date', from);
    }

    if (to) {
      query = query.lte('event_date', to);
    }

    const { data, error } = await query;

    if (error) {
      return {
        data: null,
        error: toServiceError('PLOTTING_CALENDAR_EVENTS_LOOKUP_FAILED', 'Failed to load plotted events.', error),
      };
    }

    return { data: (data as EventRow[]) ?? [], error: null };
  }

  private async syncLegacyAvailabilityFields(calendarId: string): Promise<void> {
    const { data: dayData } = await this.supabase
      .from('plotting_calendar_days')
      .select('id, date')
      .eq('plotting_calendar_id', calendarId)
      .order('date', { ascending: true });

    const days = ((dayData ?? []) as Array<Record<string, unknown>>).map(normalizeDayRow);
    const dayIds = days.map((day) => day.id);
    let slots: PlottingCalendarTimeSlotRow[] = [];

    if (dayIds.length) {
      const { data: slotData } = await this.supabase
        .from('plotting_calendar_time_slots')
        .select('*')
        .in('plotting_calendar_day_id', dayIds)
        .order('starts_at', { ascending: true });

      slots = ((slotData ?? []) as Array<Record<string, unknown>>).map(normalizeTimeSlotRow);
    }

    const uniqueSlots = Array.from(
      new Map(slots.map((slot) => [
        `${stripSeconds(slot.starts_at)}|${stripSeconds(slot.ends_at)}`,
        {
          label: slot.label ?? undefined,
          start_time: stripSeconds(slot.starts_at),
          end_time: stripSeconds(slot.ends_at),
        },
      ])).values()
    );

    await this.supabase
      .from('plotting_calendars')
      .update({
        allowed_dates: days.map((day) => day.date).sort(),
        allowed_time_slots: uniqueSlots,
      })
      .eq('id', calendarId);
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

      const calendar = normalizeCalendarRow(data as Record<string, unknown>);
      if (calendar.allowed_dates.length) {
        await this.upsertAvailability(actor, calendar.id, {
          days: calendar.allowed_dates.map((date) => ({
            date,
            status: 'open',
            max_events_for_day: calendar.max_events_per_date,
            slots: calendar.allowed_time_slots.map((slot) => ({
              label: slot.label ?? null,
              starts_at: slot.start_time,
              ends_at: slot.end_time,
              status: 'open',
              max_events_for_slot: calendar.max_events_per_slot,
            })),
          })),
          replace_existing: true,
        });
      }

      return { data: calendar, error: null };
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

      const calendar = normalizeCalendarRow(data as Record<string, unknown>);
      if (calendar.allowed_dates.length && (parsed.allowed_dates || parsed.allowed_time_slots || parsed.max_events_per_date !== undefined || parsed.max_events_per_slot !== undefined)) {
        await this.upsertAvailability(actor, calendar.id, {
          days: calendar.allowed_dates.map((date) => ({
            date,
            status: 'open',
            max_events_for_day: calendar.max_events_per_date,
            slots: calendar.allowed_time_slots.map((slot) => ({
              label: slot.label ?? null,
              starts_at: slot.start_time,
              ends_at: slot.end_time,
              status: 'open',
              max_events_for_slot: calendar.max_events_per_slot,
            })),
          })),
          replace_existing: true,
        });
      }

      return { data: calendar, error: null };
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

  async getAvailability(
    actor: EventActorContext,
    calendarId: string,
    range: { from?: string; to?: string } = {}
  ): Promise<ServiceResult<CalendarAvailabilityDay[]>> {
    try {
      const parsedRange = AvailabilityRangeSchema.parse(range);
      const calendarResult = await this.getCalendar(actor, calendarId);
      if (calendarResult.error || !calendarResult.data) {
        return { data: null, error: calendarResult.error };
      }

      let dayQuery = this.supabase
        .from('plotting_calendar_days')
        .select('*')
        .eq('plotting_calendar_id', calendarId)
        .order('date', { ascending: true });

      if (parsedRange.from) {
        dayQuery = dayQuery.gte('date', parsedRange.from);
      }

      if (parsedRange.to) {
        dayQuery = dayQuery.lte('date', parsedRange.to);
      }

      const { data: dayData, error: dayError } = await dayQuery;
      if (dayError) {
        return {
          data: null,
          error: toServiceError('PLOTTING_AVAILABILITY_LOOKUP_FAILED', 'Failed to load plotting calendar availability.', dayError),
        };
      }

      const days = ((dayData ?? []) as Array<Record<string, unknown>>).map(normalizeDayRow);
      const dayIds = days.map((day) => day.id);
      let slots: PlottingCalendarTimeSlotRow[] = [];

      if (dayIds.length) {
        const { data: slotData, error: slotError } = await this.supabase
          .from('plotting_calendar_time_slots')
          .select('*')
          .in('plotting_calendar_day_id', dayIds)
          .order('starts_at', { ascending: true });

        if (slotError) {
          return {
            data: null,
            error: toServiceError('PLOTTING_AVAILABILITY_LOOKUP_FAILED', 'Failed to load plotting calendar time slots.', slotError),
          };
        }

        slots = ((slotData ?? []) as Array<Record<string, unknown>>).map(normalizeTimeSlotRow);
      }

      const eventResult = await this.getActiveEventsForCalendar(calendarResult.data, parsedRange.from, parsedRange.to);
      if (eventResult.error || !eventResult.data) {
        return { data: null, error: eventResult.error };
      }

      const slotsByDay = new Map<string, PlottingCalendarTimeSlotRow[]>();
      for (const slot of slots) {
        const current = slotsByDay.get(slot.plotting_calendar_day_id) ?? [];
        current.push(slot);
        slotsByDay.set(slot.plotting_calendar_day_id, current);
      }

      const response = days.map((day) => {
        const sameDayEvents = eventResult.data!.filter((event) => event.event_date === day.date);
        const dayCapacity = day.max_events_for_day ?? calendarResult.data!.max_events_per_date;
        const remainingDayCapacity = dayCapacity != null ? Math.max(dayCapacity - sameDayEvents.length, 0) : null;
        const dayOpen = day.status === 'open' && (remainingDayCapacity == null || remainingDayCapacity > 0);

        const enrichedSlots = (slotsByDay.get(day.id) ?? []).map((slot) => {
          const currentEvents = sameDayEvents.filter(
            (event) => stripSeconds(event.start_time) === stripSeconds(slot.starts_at) && stripSeconds(event.end_time) === stripSeconds(slot.ends_at)
          ).length;
          const slotCapacity = slot.max_events_for_slot ?? calendarResult.data!.max_events_per_slot;
          const remainingSlotCapacity = slotCapacity != null ? Math.max(slotCapacity - currentEvents, 0) : null;
          const slotOpen = dayOpen && slot.status === 'open' && (remainingSlotCapacity == null || remainingSlotCapacity > 0);

          return {
            ...slot,
            starts_at: stripSeconds(slot.starts_at),
            ends_at: stripSeconds(slot.ends_at),
            current_events: currentEvents,
            remaining_slot_capacity: remainingSlotCapacity,
            available: slotOpen,
          };
        });

        return {
          ...day,
          date_events: sameDayEvents.length,
          remaining_day_capacity: remainingDayCapacity,
          available: dayOpen && enrichedSlots.some((slot) => slot.available),
          slots: enrichedSlots,
        };
      });

      return { data: response, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('PLOTTING_AVAILABILITY_FILTER_INVALID', 'Invalid availability query.', error),
      };
    }
  }

  async upsertAvailability(
    actor: EventActorContext,
    calendarId: string,
    input: PlottingCalendarAvailabilityInput
  ): Promise<ServiceResult<CalendarAvailabilityDay[]>> {
    try {
      if (!this.canManage(actor)) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You do not have permission to manage plotting calendar availability.'),
        };
      }

      const calendarResult = await this.getCalendar(actor, calendarId);
      if (calendarResult.error || !calendarResult.data) {
        return { data: null, error: calendarResult.error };
      }

      const parsed = AvailabilityUpdateSchema.parse(input);
      const dates = parsed.days.map((day) => day.date);

      if (parsed.replace_existing) {
        let deleteQuery = this.supabase
          .from('plotting_calendar_days')
          .delete()
          .eq('plotting_calendar_id', calendarId);

        if (dates.length) {
          deleteQuery = deleteQuery.in('date', dates);
        }

        const { error: deleteError } = await deleteQuery;
        if (deleteError) {
          return {
            data: null,
            error: toServiceError('PLOTTING_AVAILABILITY_SAVE_FAILED', 'Failed to replace plotting calendar days.', deleteError),
          };
        }
      }

      const dayRows = parsed.days.map((day) => ({
        plotting_calendar_id: calendarId,
        date: day.date,
        status: day.status ?? 'open',
        max_events_for_day: day.max_events_for_day ?? calendarResult.data!.max_events_per_date,
        notes: day.notes ?? null,
      }));

      const { data: savedDayData, error: dayError } = await this.supabase
        .from('plotting_calendar_days')
        .upsert(dayRows, { onConflict: 'plotting_calendar_id,date' })
        .select('*');

      if (dayError || !savedDayData) {
        return {
          data: null,
          error: toServiceError('PLOTTING_AVAILABILITY_SAVE_FAILED', 'Failed to save plotting calendar days.', dayError),
        };
      }

      const savedDays = (savedDayData as Array<Record<string, unknown>>).map(normalizeDayRow);
      const savedDayIds = savedDays.map((day) => day.id);

      if (savedDayIds.length) {
        const { error: slotDeleteError } = await this.supabase
          .from('plotting_calendar_time_slots')
          .delete()
          .in('plotting_calendar_day_id', savedDayIds);

        if (slotDeleteError) {
          return {
            data: null,
            error: toServiceError('PLOTTING_AVAILABILITY_SAVE_FAILED', 'Failed to replace plotting calendar time slots.', slotDeleteError),
          };
        }
      }

      const dayIdByDate = new Map(savedDays.map((day) => [day.date, day.id]));
      const slotRows = parsed.days.flatMap((day) => {
        const dayId = dayIdByDate.get(day.date);
        if (!dayId) return [];
        return (day.slots ?? []).map((slot) => ({
          plotting_calendar_day_id: dayId,
          starts_at: slot.starts_at,
          ends_at: slot.ends_at,
          label: slot.label?.trim() || null,
          status: slot.status ?? 'open',
          max_events_for_slot: slot.max_events_for_slot ?? calendarResult.data!.max_events_per_slot,
        }));
      });

      if (slotRows.length) {
        const { error: slotError } = await this.supabase
          .from('plotting_calendar_time_slots')
          .insert(slotRows);

        if (slotError) {
          return {
            data: null,
            error: toServiceError('PLOTTING_AVAILABILITY_SAVE_FAILED', 'Failed to save plotting calendar time slots.', slotError),
          };
        }
      }

      await this.syncLegacyAvailabilityFields(calendarId);

      return this.getAvailability(actor, calendarId, {
        from: dates.sort()[0],
        to: dates.sort()[dates.length - 1],
      });
    } catch (error) {
      return {
        data: null,
        error: toServiceError('PLOTTING_AVAILABILITY_VALIDATION_ERROR', 'Invalid plotting calendar availability payload.', error),
      };
    }
  }

  async getAvailableSlots(actor: EventActorContext, calendarId: string): Promise<ServiceResult<SlotAvailability[]>> {
    const availabilityResult = await this.getAvailability(actor, calendarId);
    if (availabilityResult.error || !availabilityResult.data) {
      return { data: null, error: availabilityResult.error };
    }

    const items = availabilityResult.data.flatMap((day) =>
      day.slots.map((slot) => ({
        day_id: day.id,
        slot_id: slot.id,
        event_date: day.date,
        day_status: day.status,
        slot_status: slot.status,
        slot: {
          label: slot.label ?? undefined,
          start_time: slot.starts_at,
          end_time: slot.ends_at,
        },
        current_events: slot.current_events,
        date_events: day.date_events,
        remaining_slot_capacity: slot.remaining_slot_capacity,
        remaining_date_capacity: day.remaining_day_capacity,
        available: slot.available,
      }))
    );

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
      if (!calendar.allowed_event_types.includes(parsed.type)) {
        return {
          data: null,
          error: toServiceError('PLOTTING_TYPE_NOT_ALLOWED', 'Selected event type is not available on this plotting calendar.'),
        };
      }

      const availabilityResult = await this.getAvailability(actor, calendarId, {
        from: parsed.event_date,
        to: parsed.event_date,
      });
      if (availabilityResult.error || !availabilityResult.data) {
        return { data: null, error: availabilityResult.error };
      }

      const targetDay = availabilityResult.data.find((day) => day.date === parsed.event_date);
      if (!targetDay || targetDay.status !== 'open') {
        return {
          data: null,
          error: toServiceError('PLOTTING_DATE_NOT_ALLOWED', 'Selected date is not available on this plotting calendar.'),
        };
      }

      const targetAvailability = targetDay.slots.find(
        (slot) => stripSeconds(slot.starts_at) === stripSeconds(parsed.start_time) && stripSeconds(slot.ends_at) === stripSeconds(parsed.end_time)
      );

      if (!targetAvailability) {
        return {
          data: null,
          error: toServiceError('PLOTTING_SLOT_NOT_ALLOWED', 'Selected time slot is not available on this plotting calendar.'),
        };
      }

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
