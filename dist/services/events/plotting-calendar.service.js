"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlottingCalendarService = void 0;
exports.generatePlottingCalendarAccessCode = generatePlottingCalendarAccessCode;
const crypto_1 = require("crypto");
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
const calendarStatusSchema = zod_1.z.enum(['active', 'closed', 'expired', 'archived']);
const accessTypeSchema = zod_1.z.enum(['org', 'users', 'organizations', 'share_token', 'organization_link']);
const dayStatusSchema = zod_1.z.enum(['open', 'unavailable', 'fully_booked']);
const slotStatusSchema = zod_1.z.enum(['open', 'unavailable', 'fully_booked']);
const availabilityModeSchema = zod_1.z.enum(['flexible', 'slots']);
const DEFAULT_FLEXIBLE_START = '08:00';
const DEFAULT_FLEXIBLE_END = '17:00';
const PlottingCalendarCreateSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid(),
    title: zod_1.z.string().trim().min(3),
    description: zod_1.z.string().trim().optional().nullable(),
    allowed_dates: zod_1.z.array(zod_1.z.string().date()).optional().default([]),
    allowed_time_slots: zod_1.z.array(slotSchema).optional().default([]),
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
const AvailabilityRangeSchema = zod_1.z.object({
    from: zod_1.z.string().date().optional(),
    to: zod_1.z.string().date().optional(),
});
const AvailabilitySlotSchema = zod_1.z.object({
    label: zod_1.z.string().trim().optional().nullable(),
    starts_at: timeSchema,
    ends_at: timeSchema,
    status: slotStatusSchema.optional(),
    max_events_for_slot: zod_1.z.number().int().positive().optional().nullable(),
}).superRefine((value, context) => {
    if (value.starts_at >= value.ends_at) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['ends_at'],
            message: 'ends_at must be later than starts_at.',
        });
    }
});
const AvailabilityDaySchema = zod_1.z.object({
    date: zod_1.z.string().date(),
    status: dayStatusSchema.optional(),
    availability_mode: availabilityModeSchema.optional(),
    flexible_starts_at: timeSchema.optional().nullable(),
    flexible_ends_at: timeSchema.optional().nullable(),
    max_events_for_day: zod_1.z.number().int().positive().optional().nullable(),
    notes: zod_1.z.string().trim().optional().nullable(),
    slots: zod_1.z.array(AvailabilitySlotSchema).optional(),
}).superRefine((value, context) => {
    const availabilityMode = value.availability_mode ?? ((value.slots?.length ?? 0) > 0 ? 'slots' : 'flexible');
    const flexibleStart = value.flexible_starts_at ?? DEFAULT_FLEXIBLE_START;
    const flexibleEnd = value.flexible_ends_at ?? DEFAULT_FLEXIBLE_END;
    if (availabilityMode === 'slots' && (!value.slots || value.slots.length === 0)) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['slots'],
            message: 'At least one slot is required when availability_mode is slots.',
        });
    }
    if (availabilityMode === 'flexible' && flexibleStart >= flexibleEnd) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['flexible_ends_at'],
            message: 'flexible_ends_at must be later than flexible_starts_at.',
        });
    }
});
const AvailabilityUpdateSchema = zod_1.z.object({
    days: zod_1.z.array(AvailabilityDaySchema).min(1),
    replace_existing: zod_1.z.boolean().optional(),
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
    coverage_area_id: zod_1.z.string().uuid().optional().nullable(),
    coverage_area_psgc_code: zod_1.z.string().trim().optional().nullable(),
    coverage_area_boundary_id: zod_1.z.string().trim().optional().nullable(),
    coverage_area_name: zod_1.z.string().trim().optional().nullable(),
    coverage_area_province: zod_1.z.string().trim().optional().nullable(),
    coverage_area_municipality: zod_1.z.string().trim().optional().nullable(),
    coverage_area_barangay: zod_1.z.string().trim().optional().nullable(),
    coverage_area_normalized_key: zod_1.z.string().trim().optional().nullable(),
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
function resolveAvailabilityMode(day) {
    if (day.availability_mode === 'flexible' || day.availability_mode === 'slots') {
        return day.availability_mode;
    }
    return (day.slots?.length ?? 0) > 0 ? 'slots' : 'flexible';
}
function resolveFlexibleWindow(day) {
    return {
        flexible_starts_at: stripSeconds(day.flexible_starts_at) || DEFAULT_FLEXIBLE_START,
        flexible_ends_at: stripSeconds(day.flexible_ends_at) || DEFAULT_FLEXIBLE_END,
    };
}
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
        public_access_code: typeof row.public_access_code === 'string' ? row.public_access_code : undefined,
        expires_at: typeof row.expires_at === 'string' ? row.expires_at : null,
        status: String(row.status || 'active'),
        created_by: typeof row.created_by === 'string' ? row.created_by : null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
    };
}
function normalizeDayRow(row) {
    return {
        id: String(row.id),
        plotting_calendar_id: String(row.plotting_calendar_id),
        date: String(row.date),
        status: String(row.status || 'open'),
        availability_mode: String(row.availability_mode || 'slots'),
        flexible_starts_at: row.flexible_starts_at == null ? null : String(row.flexible_starts_at),
        flexible_ends_at: row.flexible_ends_at == null ? null : String(row.flexible_ends_at),
        max_events_for_day: typeof row.max_events_for_day === 'number' ? row.max_events_for_day : null,
        notes: typeof row.notes === 'string' ? row.notes : null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
    };
}
function normalizeTimeSlotRow(row) {
    return {
        id: String(row.id),
        plotting_calendar_day_id: String(row.plotting_calendar_day_id),
        starts_at: String(row.starts_at),
        ends_at: String(row.ends_at),
        label: typeof row.label === 'string' ? row.label : null,
        status: String(row.status || 'open'),
        max_events_for_slot: typeof row.max_events_for_slot === 'number' ? row.max_events_for_slot : null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
    };
}
function stripSeconds(value) {
    return String(value ?? '').slice(0, 5);
}
function resolveShareToken(accessType, existingShareToken) {
    if (accessType === 'share_token' || accessType === 'organization_link') {
        return existingShareToken ?? (0, crypto_1.randomUUID)();
    }
    return existingShareToken;
}
function isPlottingCalendarAccessTypeConstraintError(error) {
    if (!error || typeof error !== 'object') {
        return false;
    }
    const candidate = error;
    const code = candidate.code;
    const message = typeof candidate.message === 'string' ? candidate.message : '';
    const details = typeof candidate.details === 'string' ? candidate.details : '';
    const hint = typeof candidate.hint === 'string' ? candidate.hint : '';
    const combined = `${String(code ?? '')} ${message} ${details} ${hint}`;
    return combined.includes('23514') && combined.includes('plotting_calendars_access_type_check');
}
function generatePlottingCalendarAccessCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude O, 0, I, 1
    let code = '';
    const bytes = (0, crypto_1.randomBytes)(6);
    for (let i = 0; i < 6; i++) {
        code += chars[bytes[i] % chars.length];
    }
    return code;
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
        if (calendar.access_type === 'org' || calendar.access_type === 'share_token' || calendar.access_type === 'organization_link') {
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
    async getActiveEventsForCalendar(calendar, from, to) {
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
                error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_EVENTS_LOOKUP_FAILED', 'Failed to load plotted events.', error),
            };
        }
        return { data: data ?? [], error: null };
    }
    async syncLegacyAvailabilityFields(calendarId) {
        const { data: dayData } = await this.supabase
            .from('plotting_calendar_days')
            .select('id, date')
            .eq('plotting_calendar_id', calendarId)
            .order('date', { ascending: true });
        const days = (dayData ?? []).map(normalizeDayRow);
        const dayIds = days.map((day) => day.id);
        let slots = [];
        if (dayIds.length) {
            const { data: slotData } = await this.supabase
                .from('plotting_calendar_time_slots')
                .select('*')
                .in('plotting_calendar_day_id', dayIds)
                .order('starts_at', { ascending: true });
            slots = (slotData ?? []).map(normalizeTimeSlotRow);
        }
        const uniqueSlots = Array.from(new Map(slots.map((slot) => [
            `${stripSeconds(slot.starts_at)}|${stripSeconds(slot.ends_at)}`,
            {
                label: slot.label ?? undefined,
                start_time: stripSeconds(slot.starts_at),
                end_time: stripSeconds(slot.ends_at),
            },
        ])).values());
        await this.supabase
            .from('plotting_calendars')
            .update({
            allowed_dates: days.map((day) => day.date).sort(),
            allowed_time_slots: uniqueSlots,
        })
            .eq('id', calendarId);
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
            const accessType = parsed.access_type ?? 'organization_link';
            let generatedAccessCode;
            let public_access_code;
            if (accessType === 'organization_link' || accessType === 'share_token') {
                generatedAccessCode = generatePlottingCalendarAccessCode();
                public_access_code = generatedAccessCode;
            }
            const { data, error } = await this.supabase
                .from('plotting_calendars')
                .insert({
                ...parsed,
                created_by: parsed.created_by ?? actor.id,
                access_type: accessType,
                status: parsed.status ?? 'active',
                allowed_user_ids: parsed.allowed_user_ids ?? [],
                allowed_organization_ids: parsed.allowed_organization_ids ?? [],
                share_token: resolveShareToken(accessType, parsed.share_token),
                public_access_code,
            })
                .select('*')
                .single();
            if (error || !data) {
                const accessTypeConstraintError = isPlottingCalendarAccessTypeConstraintError(error);
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)(accessTypeConstraintError ? 'PLOTTING_CALENDAR_ACCESS_TYPE_CONSTRAINT_VIOLATION' : 'PLOTTING_CALENDAR_CREATE_FAILED', accessTypeConstraintError
                        ? 'Invalid plotting calendar access type. Check database constraint and allowed access modes.'
                        : 'Failed to create plotting calendar.', error),
                };
            }
            const calendar = normalizeCalendarRow(data);
            if (calendar.allowed_dates.length) {
                const availabilityMode = calendar.allowed_time_slots.length ? 'slots' : 'flexible';
                await this.upsertAvailability(actor, calendar.id, {
                    days: calendar.allowed_dates.map((date) => ({
                        date,
                        status: 'open',
                        availability_mode: availabilityMode,
                        flexible_starts_at: availabilityMode === 'flexible' ? DEFAULT_FLEXIBLE_START : null,
                        flexible_ends_at: availabilityMode === 'flexible' ? DEFAULT_FLEXIBLE_END : null,
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
            return { data: { ...calendar, generated_access_code: generatedAccessCode }, error: null };
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
            const updatePayload = { ...parsed };
            if (parsed.access_type === 'share_token' || parsed.access_type === 'organization_link') {
                updatePayload.share_token = resolveShareToken(parsed.access_type, parsed.share_token) ?? existingResult.data.share_token;
            }
            else if (parsed.share_token !== undefined) {
                updatePayload.share_token = parsed.share_token;
            }
            const { data, error } = await this.supabase
                .from('plotting_calendars')
                .update(updatePayload)
                .eq('id', calendarId)
                .eq('org_id', actor.org_id)
                .select('*')
                .single();
            if (error || !data) {
                const accessTypeConstraintError = isPlottingCalendarAccessTypeConstraintError(error);
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)(accessTypeConstraintError ? 'PLOTTING_CALENDAR_ACCESS_TYPE_CONSTRAINT_VIOLATION' : 'PLOTTING_CALENDAR_UPDATE_FAILED', accessTypeConstraintError
                        ? 'Invalid plotting calendar access type. Check database constraint and allowed access modes.'
                        : 'Failed to update plotting calendar.', error),
                };
            }
            const calendar = normalizeCalendarRow(data);
            if (calendar.allowed_dates.length && (parsed.allowed_dates || parsed.allowed_time_slots || parsed.max_events_per_date !== undefined || parsed.max_events_per_slot !== undefined)) {
                const availabilityMode = calendar.allowed_time_slots.length ? 'slots' : 'flexible';
                await this.upsertAvailability(actor, calendar.id, {
                    days: calendar.allowed_dates.map((date) => ({
                        date,
                        status: 'open',
                        availability_mode: availabilityMode,
                        flexible_starts_at: availabilityMode === 'flexible' ? DEFAULT_FLEXIBLE_START : null,
                        flexible_ends_at: availabilityMode === 'flexible' ? DEFAULT_FLEXIBLE_END : null,
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
    async regenerateAccessCode(actor, calendarId) {
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
        const calendar = existingResult.data;
        if (calendar.access_type !== 'organization_link' && calendar.access_type !== 'share_token') {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_NO_SHARE_LINK', 'This plotting calendar does not use a share link.'),
            };
        }
        const generated = generatePlottingCalendarAccessCode();
        const { error } = await this.supabase
            .from('plotting_calendars')
            .update({ public_access_code: generated })
            .eq('id', calendarId)
            .eq('org_id', actor.org_id);
        if (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_REGENERATE_CODE_FAILED', 'Failed to regenerate access code.', error),
            };
        }
        return { data: { code: generated }, error: null };
    }
    async getAvailability(actor, calendarId, range = {}) {
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
                    error: (0, event_types_1.toServiceError)('PLOTTING_AVAILABILITY_LOOKUP_FAILED', 'Failed to load plotting calendar availability.', dayError),
                };
            }
            const days = (dayData ?? []).map(normalizeDayRow);
            const dayIds = days.map((day) => day.id);
            let slots = [];
            if (dayIds.length) {
                const { data: slotData, error: slotError } = await this.supabase
                    .from('plotting_calendar_time_slots')
                    .select('*')
                    .in('plotting_calendar_day_id', dayIds)
                    .order('starts_at', { ascending: true });
                if (slotError) {
                    return {
                        data: null,
                        error: (0, event_types_1.toServiceError)('PLOTTING_AVAILABILITY_LOOKUP_FAILED', 'Failed to load plotting calendar time slots.', slotError),
                    };
                }
                slots = (slotData ?? []).map(normalizeTimeSlotRow);
            }
            const eventResult = await this.getActiveEventsForCalendar(calendarResult.data, parsedRange.from, parsedRange.to);
            if (eventResult.error || !eventResult.data) {
                return { data: null, error: eventResult.error };
            }
            const slotsByDay = new Map();
            for (const slot of slots) {
                const current = slotsByDay.get(slot.plotting_calendar_day_id) ?? [];
                current.push(slot);
                slotsByDay.set(slot.plotting_calendar_day_id, current);
            }
            const response = days.map((day) => {
                const sameDayEvents = eventResult.data.filter((event) => event.event_date === day.date);
                const dayCapacity = day.max_events_for_day ?? calendarResult.data.max_events_per_date;
                const remainingDayCapacity = dayCapacity != null ? Math.max(dayCapacity - sameDayEvents.length, 0) : null;
                const dayOpen = day.status === 'open' && (remainingDayCapacity == null || remainingDayCapacity > 0);
                const availabilityMode = resolveAvailabilityMode(day);
                const flexibleWindow = resolveFlexibleWindow(day);
                const enrichedSlots = (slotsByDay.get(day.id) ?? []).map((slot) => {
                    const currentEvents = sameDayEvents.filter((event) => {
                        if (event.extra_data && 'slot_id' in event.extra_data && event.extra_data.slot_id) {
                            return event.extra_data.slot_id === slot.id;
                        }
                        // fallback for legacy events that were plotted without a slot_id
                        return stripSeconds(event.start_time) === stripSeconds(slot.starts_at) && stripSeconds(event.end_time) === stripSeconds(slot.ends_at);
                    }).length;
                    const slotCapacity = slot.max_events_for_slot ?? calendarResult.data.max_events_per_slot;
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
                    availability_mode: availabilityMode,
                    flexible_starts_at: availabilityMode === 'flexible' ? flexibleWindow.flexible_starts_at : null,
                    flexible_ends_at: availabilityMode === 'flexible' ? flexibleWindow.flexible_ends_at : null,
                    date_events: sameDayEvents.length,
                    remaining_day_capacity: remainingDayCapacity,
                    available: dayOpen && (availabilityMode === 'flexible' || enrichedSlots.some((slot) => slot.available)),
                    slots: enrichedSlots,
                };
            });
            return { data: response, error: null };
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PLOTTING_AVAILABILITY_FILTER_INVALID', 'Invalid availability query.', error),
            };
        }
    }
    async upsertAvailability(actor, calendarId, input) {
        try {
            if (!this.canManage(actor)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to manage plotting calendar availability.'),
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
                        error: (0, event_types_1.toServiceError)('PLOTTING_AVAILABILITY_SAVE_FAILED', 'Failed to replace plotting calendar days.', deleteError),
                    };
                }
            }
            const dayRows = parsed.days.map((day) => {
                const availabilityMode = resolveAvailabilityMode(day);
                const flexibleWindow = resolveFlexibleWindow(day);
                return {
                    plotting_calendar_id: calendarId,
                    date: day.date,
                    status: day.status ?? 'open',
                    availability_mode: availabilityMode,
                    flexible_starts_at: availabilityMode === 'flexible' ? flexibleWindow.flexible_starts_at : null,
                    flexible_ends_at: availabilityMode === 'flexible' ? flexibleWindow.flexible_ends_at : null,
                    max_events_for_day: day.max_events_for_day ?? calendarResult.data.max_events_per_date,
                    notes: day.notes ?? null,
                };
            });
            const { data: savedDayData, error: dayError } = await this.supabase
                .from('plotting_calendar_days')
                .upsert(dayRows, { onConflict: 'plotting_calendar_id,date' })
                .select('*');
            if (dayError || !savedDayData) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PLOTTING_AVAILABILITY_SAVE_FAILED', 'Failed to save plotting calendar days.', dayError),
                };
            }
            const savedDays = savedDayData.map(normalizeDayRow);
            const savedDayIds = savedDays.map((day) => day.id);
            if (savedDayIds.length) {
                const { error: slotDeleteError } = await this.supabase
                    .from('plotting_calendar_time_slots')
                    .delete()
                    .in('plotting_calendar_day_id', savedDayIds);
                if (slotDeleteError) {
                    return {
                        data: null,
                        error: (0, event_types_1.toServiceError)('PLOTTING_AVAILABILITY_SAVE_FAILED', 'Failed to replace plotting calendar time slots.', slotDeleteError),
                    };
                }
            }
            const dayIdByDate = new Map(savedDays.map((day) => [day.date, day.id]));
            const slotRows = parsed.days.flatMap((day) => {
                const dayId = dayIdByDate.get(day.date);
                if (!dayId)
                    return [];
                if (resolveAvailabilityMode(day) !== 'slots') {
                    return [];
                }
                return (day.slots ?? []).map((slot) => ({
                    plotting_calendar_day_id: dayId,
                    starts_at: slot.starts_at,
                    ends_at: slot.ends_at,
                    label: slot.label?.trim() || null,
                    status: slot.status ?? 'open',
                    max_events_for_slot: slot.max_events_for_slot ?? calendarResult.data.max_events_per_slot,
                }));
            });
            if (slotRows.length) {
                const { error: slotError } = await this.supabase
                    .from('plotting_calendar_time_slots')
                    .insert(slotRows);
                if (slotError) {
                    return {
                        data: null,
                        error: (0, event_types_1.toServiceError)('PLOTTING_AVAILABILITY_SAVE_FAILED', 'Failed to save plotting calendar time slots.', slotError),
                    };
                }
            }
            await this.syncLegacyAvailabilityFields(calendarId);
            return this.getAvailability(actor, calendarId, {
                from: dates.sort()[0],
                to: dates.sort()[dates.length - 1],
            });
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PLOTTING_AVAILABILITY_VALIDATION_ERROR', 'Invalid plotting calendar availability payload.', error),
            };
        }
    }
    async getAvailableSlots(actor, calendarId) {
        const availabilityResult = await this.getAvailability(actor, calendarId);
        if (availabilityResult.error || !availabilityResult.data) {
            return { data: null, error: availabilityResult.error };
        }
        const items = availabilityResult.data.map((day) => {
            if (day.availability_mode === 'flexible') {
                return {
                    availability_mode: 'flexible',
                    date: day.date,
                    max_events: day.max_events_for_day,
                    reserved_count: day.date_events,
                    remaining_count: day.remaining_day_capacity,
                    flexible_starts_at: day.flexible_starts_at ?? DEFAULT_FLEXIBLE_START,
                    flexible_ends_at: day.flexible_ends_at ?? DEFAULT_FLEXIBLE_END,
                };
            }
            return {
                availability_mode: 'slots',
                date: day.date,
                slots: day.slots.map((slot) => ({
                    id: slot.id,
                    label: slot.label ?? null,
                    start_time: slot.starts_at,
                    end_time: slot.ends_at,
                    max_events: slot.max_events_for_slot ?? null,
                    reserved_count: slot.current_events,
                    remaining_count: slot.remaining_slot_capacity,
                })),
            };
        });
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
            if (!calendar.allowed_event_types.includes(parsed.type)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PLOTTING_TYPE_NOT_ALLOWED', 'Selected event type is not available on this plotting calendar.'),
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
                    error: (0, event_types_1.toServiceError)('PLOTTING_DATE_NOT_ALLOWED', 'Selected date is not available on this plotting calendar.'),
                };
            }
            if (!targetDay.available) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PLOTTING_DATE_FULL', 'The selected plotting calendar date is already full.'),
                };
            }
            let slotIdForExtraData = undefined;
            if (targetDay.availability_mode === 'slots') {
                const targetAvailability = targetDay.slots.find((slot) => stripSeconds(slot.starts_at) === stripSeconds(parsed.start_time) && stripSeconds(slot.ends_at) === stripSeconds(parsed.end_time));
                if (!targetAvailability) {
                    return {
                        data: null,
                        error: (0, event_types_1.toServiceError)('PLOTTING_SLOT_NOT_ALLOWED', 'Selected time slot is not available on this plotting calendar.'),
                    };
                }
                if (!targetAvailability.available) {
                    return {
                        data: null,
                        error: (0, event_types_1.toServiceError)('PLOTTING_SLOT_FULL', 'The selected plotting calendar slot is already full.'),
                    };
                }
                slotIdForExtraData = targetAvailability.id;
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
                coverage_area_id: parsed.coverage_area_id ?? null,
                coverage_area_psgc_code: parsed.coverage_area_psgc_code ?? null,
                coverage_area_boundary_id: parsed.coverage_area_boundary_id ?? null,
                coverage_area_name: parsed.coverage_area_name ?? null,
                coverage_area_province: parsed.coverage_area_province ?? null,
                coverage_area_municipality: parsed.coverage_area_municipality ?? null,
                coverage_area_barangay: parsed.coverage_area_barangay ?? null,
                coverage_area_normalized_key: parsed.coverage_area_normalized_key ?? null,
                extra_data: {
                    ...(parsed.extra_data ?? {}),
                    plotted_from_calendar: true,
                    plotting_calendar_title: calendar.title,
                    ...(slotIdForExtraData ? { slot_id: slotIdForExtraData } : {}),
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
