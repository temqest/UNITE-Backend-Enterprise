"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlottingCalendarService = void 0;
const zod_1 = require("zod");
const event_types_1 = require("./event.types");
const event_service_1 = require("./event.service");
const timeSchema = zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/);
const slotSchema = zod_1.z.object({
    label: zod_1.z.string().trim().optional(),
    start_time: timeSchema,
    end_time: timeSchema,
}).superRefine((value, context) => {
    if (value.start_time >= value.end_time) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['end_time'],
            message: 'end_time must be later than start_time.',
        });
    }
});
const calendarStatusSchema = zod_1.z.enum(['active', 'inactive', 'expired', 'archived']);
const accessTypeSchema = zod_1.z.enum(['org', 'users', 'organizations', 'share_token']);
const PlottingCalendarCreateSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid(),
    title: zod_1.z.string().trim().min(3),
    description: zod_1.z.string().trim().optional().nullable(),
    allowed_dates: zod_1.z.array(zod_1.z.string().date()).min(1),
    allowed_time_slots: zod_1.z.array(slotSchema).min(1),
    allowed_event_types: zod_1.z.array(zod_1.z.enum(['blood_drive', 'training', 'advocacy', 'assembly'])).min(1),
    max_events_per_date: zod_1.z.number().int().positive().optional().nullable(),
    max_events_per_slot: zod_1.z.number().int().positive().optional().nullable(),
    access_type: accessTypeSchema.optional(),
    allowed_user_ids: zod_1.z.array(zod_1.z.string().uuid()).optional(),
    allowed_organization_ids: zod_1.z.array(zod_1.z.string().uuid()).optional(),
    share_token: zod_1.z.string().trim().optional().nullable(),
    expires_at: zod_1.z.string().datetime().optional().nullable(),
    status: calendarStatusSchema.optional(),
    created_by: zod_1.z.string().uuid().optional().nullable(),
});
const PlottingCalendarUpdateSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(3).optional(),
    description: zod_1.z.string().trim().optional().nullable(),
    allowed_dates: zod_1.z.array(zod_1.z.string().date()).optional(),
    allowed_time_slots: zod_1.z.array(slotSchema).optional(),
    allowed_event_types: zod_1.z.array(zod_1.z.enum(['blood_drive', 'training', 'advocacy', 'assembly'])).optional(),
    max_events_per_date: zod_1.z.number().int().positive().optional().nullable(),
    max_events_per_slot: zod_1.z.number().int().positive().optional().nullable(),
    access_type: accessTypeSchema.optional(),
    allowed_user_ids: zod_1.z.array(zod_1.z.string().uuid()).optional(),
    allowed_organization_ids: zod_1.z.array(zod_1.z.string().uuid()).optional(),
    share_token: zod_1.z.string().trim().optional().nullable(),
    expires_at: zod_1.z.string().datetime().optional().nullable(),
    status: calendarStatusSchema.optional(),
});
const PlottingCalendarFilterSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid().optional(),
    statuses: zod_1.z.array(calendarStatusSchema).optional(),
    search: zod_1.z.string().trim().optional(),
    limit: zod_1.z.number().int().min(1).max(200).optional(),
    offset: zod_1.z.number().int().min(0).optional(),
});
const PlotEventSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(3),
    type: zod_1.z.enum(['blood_drive', 'training', 'advocacy', 'assembly']),
    event_date: zod_1.z.string().date(),
    start_time: timeSchema,
    end_time: timeSchema,
    address: zod_1.z.string().trim().optional().nullable(),
    description: zod_1.z.string().trim().optional().nullable(),
    hosting_organization: zod_1.z.string().trim().optional().nullable(),
    extra_data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
}).superRefine((value, context) => {
    if (value.start_time >= value.end_time) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['end_time'],
            message: 'end_time must be later than start_time.',
        });
    }
});
function normalizeCalendarRow(row) {
    return {
        id: String(row.id),
        org_id: String(row.org_id),
        title: String(row.title),
        description: typeof row.description === 'string' ? row.description : null,
        allowed_dates: Array.isArray(row.allowed_dates) ? row.allowed_dates.map(String) : [],
        allowed_time_slots: Array.isArray(row.allowed_time_slots)
            ? row.allowed_time_slots.map((slot) => {
                const record = slot && typeof slot === 'object' && !Array.isArray(slot)
                    ? slot
                    : {};
                return {
                    label: typeof record.label === 'string' ? record.label : undefined,
                    start_time: String(record.start_time ?? ''),
                    end_time: String(record.end_time ?? ''),
                };
            })
            : [],
        allowed_event_types: Array.isArray(row.allowed_event_types) ? row.allowed_event_types.map((type) => String(type)) : [],
        max_events_per_date: typeof row.max_events_per_date === 'number' ? row.max_events_per_date : null,
        max_events_per_slot: typeof row.max_events_per_slot === 'number' ? row.max_events_per_slot : null,
        access_type: String(row.access_type || 'org'),
        allowed_user_ids: Array.isArray(row.allowed_user_ids) ? row.allowed_user_ids.map(String) : [],
        allowed_organization_ids: Array.isArray(row.allowed_organization_ids) ? row.allowed_organization_ids.map(String) : [],
        share_token: typeof row.share_token === 'string' ? row.share_token : null,
        expires_at: typeof row.expires_at === 'string' ? row.expires_at : null,
        status: String(row.status || 'active'),
        created_by: typeof row.created_by === 'string' ? row.created_by : null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
    };
}
class PlottingCalendarService {
    supabase;
    eventService;
    constructor(supabase) {
        this.supabase = supabase;
        this.eventService = new event_service_1.EventService(supabase);
    }
    canManage(actor) {
        return ((0, event_types_1.hasRoleAtLeast)(actor, 'coordinator') ||
            ((0, event_types_1.hasPermission)(actor, 'events.create') && (0, event_types_1.hasPermission)(actor, 'events.update')));
    }
    canRead(actor) {
        return (0, event_types_1.hasRoleAtLeast)(actor, 'staff') || (0, event_types_1.hasPermission)(actor, 'events.read');
    }
    hasCalendarAccess(actor, calendar) {
        if (calendar.org_id !== actor.org_id || !this.canRead(actor)) {
            return false;
        }
        if (this.canManage(actor) || (0, event_types_1.hasRoleAtLeast)(actor, 'admin')) {
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
    isExpired(calendar) {
        return Boolean(calendar.expires_at && Date.parse(calendar.expires_at) < Date.now());
    }
    async getCalendarRaw(calendarId) {
        const { data, error } = await this.supabase
            .from('plotting_calendars')
            .select('*')
            .eq('id', calendarId)
            .single();
        if (error || !data) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_NOT_FOUND', 'Plotting calendar was not found.', error),
            };
        }
        return { data: normalizeCalendarRow(data), error: null };
    }
    async getActiveEventsForCalendar(calendar) {
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
                error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_EVENTS_LOOKUP_FAILED', 'Failed to load plotted events.', error),
            };
        }
        return { data: data ?? [], error: null };
    }
    async listCalendars(actor, filter = {}) {
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
                    error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_LIST_FAILED', 'Failed to list plotting calendars.', error),
                };
            }
            let rows = (data ?? []).map(normalizeCalendarRow);
            rows = rows.filter((calendar) => this.hasCalendarAccess(actor, calendar));
            if (parsed.search) {
                const q = parsed.search.toLowerCase();
                rows = rows.filter((calendar) => `${calendar.title} ${calendar.description ?? ''}`.toLowerCase().includes(q));
            }
            return { data: rows, error: null };
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_FILTER_INVALID', 'Invalid plotting calendar filter.', error),
            };
        }
    }
    async getCalendar(actor, calendarId) {
        const calendarResult = await this.getCalendarRaw(calendarId);
        if (calendarResult.error || !calendarResult.data) {
            return { data: null, error: calendarResult.error };
        }
        if (!this.hasCalendarAccess(actor, calendarResult.data)) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have access to this plotting calendar.'),
            };
        }
        return calendarResult;
    }
    async createCalendar(actor, input) {
        try {
            if (!this.canManage(actor)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to manage plotting calendars.'),
                };
            }
            const parsed = PlottingCalendarCreateSchema.parse(input);
            if (parsed.org_id !== actor.org_id) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You can only create calendars in your own organization.'),
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
                    error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_CREATE_FAILED', 'Failed to create plotting calendar.', error),
                };
            }
            return { data: normalizeCalendarRow(data), error: null };
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_CREATE_VALIDATION_ERROR', 'Invalid plotting calendar payload.', error),
            };
        }
    }
    async updateCalendar(actor, calendarId, input) {
        try {
            if (!this.canManage(actor)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to manage plotting calendars.'),
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
                    error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_UPDATE_FAILED', 'Failed to update plotting calendar.', error),
                };
            }
            return { data: normalizeCalendarRow(data), error: null };
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_UPDATE_VALIDATION_ERROR', 'Invalid plotting calendar update payload.', error),
            };
        }
    }
    async deleteCalendar(actor, calendarId) {
        if (!this.canManage(actor)) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to delete plotting calendars.'),
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
                error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_DELETE_FAILED', 'Failed to delete plotting calendar.', error),
            };
        }
        return { data: true, error: null };
    }
    async getAvailableSlots(actor, calendarId) {
        const calendarResult = await this.getCalendar(actor, calendarId);
        if (calendarResult.error || !calendarResult.data) {
            return { data: null, error: calendarResult.error };
        }
        const calendar = calendarResult.data;
        const eventResult = await this.getActiveEventsForCalendar(calendar);
        if (eventResult.error || !eventResult.data) {
            return { data: null, error: eventResult.error };
        }
        const items = [];
        for (const eventDate of calendar.allowed_dates) {
            const sameDayEvents = eventResult.data.filter((event) => event.event_date === eventDate);
            for (const slot of calendar.allowed_time_slots) {
                const currentEvents = sameDayEvents.filter((event) => event.start_time === slot.start_time && event.end_time === slot.end_time).length;
                const remainingSlotCapacity = calendar.max_events_per_slot != null ? Math.max(calendar.max_events_per_slot - currentEvents, 0) : null;
                const remainingDateCapacity = calendar.max_events_per_date != null ? Math.max(calendar.max_events_per_date - sameDayEvents.length, 0) : null;
                items.push({
                    event_date: eventDate,
                    slot,
                    current_events: currentEvents,
                    date_events: sameDayEvents.length,
                    remaining_slot_capacity: remainingSlotCapacity,
                    remaining_date_capacity: remainingDateCapacity,
                    available: (remainingSlotCapacity == null || remainingSlotCapacity > 0) &&
                        (remainingDateCapacity == null || remainingDateCapacity > 0),
                });
            }
        }
        return { data: items, error: null };
    }
    async plotEvent(actor, calendarId, input) {
        try {
            if (!(0, event_types_1.hasPermission)(actor, 'events.create') && !(0, event_types_1.hasRoleAtLeast)(actor, 'coordinator')) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to plot events.'),
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
                    error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_INACTIVE', 'Plotting calendar is not active.'),
                };
            }
            if (this.isExpired(calendar)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_EXPIRED', 'Plotting calendar has expired.'),
                };
            }
            const parsed = PlotEventSchema.parse(input);
            if (!calendar.allowed_dates.includes(parsed.event_date)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PLOTTING_DATE_NOT_ALLOWED', 'Selected date is not available on this plotting calendar.'),
                };
            }
            if (!calendar.allowed_event_types.includes(parsed.type)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PLOTTING_TYPE_NOT_ALLOWED', 'Selected event type is not available on this plotting calendar.'),
                };
            }
            const matchingSlot = calendar.allowed_time_slots.find((slot) => slot.start_time === parsed.start_time && slot.end_time === parsed.end_time);
            if (!matchingSlot) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PLOTTING_SLOT_NOT_ALLOWED', 'Selected time slot is not available on this plotting calendar.'),
                };
            }
            const availabilityResult = await this.getAvailableSlots(actor, calendarId);
            if (availabilityResult.error || !availabilityResult.data) {
                return { data: null, error: availabilityResult.error };
            }
            const targetAvailability = availabilityResult.data.find((item) => item.event_date === parsed.event_date &&
                item.slot.start_time === parsed.start_time &&
                item.slot.end_time === parsed.end_time);
            if (!targetAvailability?.available) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PLOTTING_SLOT_FULL', 'The selected plotting calendar slot is already full.'),
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
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PLOTTING_EVENT_VALIDATION_ERROR', 'Invalid plotting event payload.', error),
            };
        }
    }
}
exports.PlottingCalendarService = PlottingCalendarService;
