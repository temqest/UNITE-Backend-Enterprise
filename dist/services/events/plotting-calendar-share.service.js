"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlottingCalendarShareService = void 0;
const zod_1 = require("zod");
const event_types_1 = require("./event.types");
const event_service_1 = require("./event.service");
const plotting_calendar_service_1 = require("./plotting-calendar.service");
const timeSchema = zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/);
const PlotEventPublicSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(3),
    type: zod_1.z.enum(['blood_drive', 'training', 'advocacy', 'assembly']),
    event_date: zod_1.z.string().date(),
    start_time: timeSchema,
    end_time: timeSchema,
    address: zod_1.z.string().trim().optional().nullable(),
    description: zod_1.z.string().trim().optional().nullable(),
    target_donations: zod_1.z.number().int().positive().optional().nullable(),
    visitor_name: zod_1.z.string().trim().min(2),
    visitor_address: zod_1.z.string().trim().min(5),
    organization_name: zod_1.z.string().trim().optional().nullable(),
    contact_number: zod_1.z.string().trim().optional().nullable(),
    email: zod_1.z.string().email().or(zod_1.z.literal('')).optional().nullable(),
}).superRefine((value, context) => {
    if (value.start_time >= value.end_time) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['end_time'],
            message: 'end_time must be later than start_time.',
        });
    }
});
class PlottingCalendarShareService {
    supabase;
    eventService;
    plottingCalendarService;
    constructor(supabase) {
        this.supabase = supabase;
        this.eventService = new event_service_1.EventService(supabase);
        this.plottingCalendarService = new plotting_calendar_service_1.PlottingCalendarService(supabase);
    }
    isExpired(calendar) {
        return Boolean(calendar.expires_at && Date.parse(calendar.expires_at) < Date.now());
    }
    async getCalendarByShareToken(shareToken) {
        const { data, error } = await this.supabase
            .from('plotting_calendars')
            .select('*')
            .eq('share_token', shareToken)
            .single();
        if (error || !data) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_NOT_FOUND', 'Plotting calendar not found or link is invalid.'),
            };
        }
        const calendar = data;
        if (calendar.access_type !== 'share_token' && calendar.access_type !== 'organization_link') {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_UNAVAILABLE', 'This plotting calendar is not accessible via share link.'),
            };
        }
        if (calendar.status !== 'active') {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_INACTIVE', 'This plotting calendar is no longer active.'),
            };
        }
        if (this.isExpired(calendar)) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PLOTTING_CALENDAR_EXPIRED', 'This plotting calendar link has expired.'),
            };
        }
        // Normalize calendar fields manually if needed, or cast since it comes from DB
        return { data: calendar, error: null };
    }
    createSystemActor(calendar) {
        return {
            id: calendar.created_by ?? '00000000-0000-0000-0000-000000000000', // fallback to zero uuid if no created_by
            org_id: calendar.org_id,
            role: {
                type: 'admin', // give admin role to bypass internal checks when plotting
                permissions: ['events.create', 'events.read', 'events.update'],
            },
            geographic_area: null,
            is_active: true,
        };
    }
    async getSharedCalendar(shareToken) {
        const result = await this.getCalendarByShareToken(shareToken);
        if (result.error || !result.data) {
            return { data: null, error: result.error };
        }
        const calendar = result.data;
        // Return only safe fields
        return {
            data: {
                id: calendar.id,
                title: calendar.title,
                description: calendar.description,
                allowed_event_types: calendar.allowed_event_types,
                allowed_dates: calendar.allowed_dates,
                status: calendar.status,
                expires_at: calendar.expires_at,
                access_type: calendar.access_type,
                max_events_per_date: calendar.max_events_per_date,
                max_events_per_slot: calendar.max_events_per_slot,
            },
            error: null,
        };
    }
    async getSharedCalendarAvailableSlots(shareToken, date) {
        const calendarResult = await this.getCalendarByShareToken(shareToken);
        if (calendarResult.error || !calendarResult.data) {
            return { data: null, error: calendarResult.error };
        }
        const actor = this.createSystemActor(calendarResult.data);
        const availabilityResult = await this.plottingCalendarService.getAvailability(actor, calendarResult.data.id, {
            from: date,
            to: date,
        });
        if (availabilityResult.error || !availabilityResult.data) {
            return { data: null, error: availabilityResult.error };
        }
        return { data: availabilityResult.data, error: null };
    }
    async plotEventPublic(shareToken, input) {
        try {
            const calendarResult = await this.getCalendarByShareToken(shareToken);
            if (calendarResult.error || !calendarResult.data) {
                return { data: null, error: calendarResult.error };
            }
            const parsed = PlotEventPublicSchema.parse(input);
            const actor = this.createSystemActor(calendarResult.data);
            const extra_data = {
                plotted_from_calendar: true,
                plotting_calendar_title: calendarResult.data.title,
                public_reservation: {
                    reserved_by_name: parsed.visitor_name,
                    reserved_by_address: parsed.visitor_address,
                    organization_name: parsed.organization_name,
                    contact_number: parsed.contact_number,
                    email: parsed.email,
                    target_donations: parsed.target_donations,
                    source: 'public_share_link',
                }
            };
            // Plot the event using the internal service
            // We pass the parsed data along with the target_donations in the root if it's supported,
            // but the inner service parses with PlotEventSchema. 
            // We will map our public fields to the internal schema.
            const internalInput = {
                title: parsed.title,
                type: parsed.type,
                event_date: parsed.event_date,
                start_time: parsed.start_time,
                end_time: parsed.end_time,
                address: parsed.address || null,
                description: parsed.description || null,
                hosting_organization: parsed.organization_name || parsed.visitor_name,
                extra_data,
            };
            const plotResult = await this.plottingCalendarService.plotEvent(actor, calendarResult.data.id, internalInput);
            if (plotResult.error || !plotResult.data) {
                return { data: null, error: plotResult.error };
            }
            return { data: plotResult.data, error: null };
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PLOTTING_EVENT_VALIDATION_ERROR', 'Invalid public plotting event payload.', error),
            };
        }
    }
}
exports.PlottingCalendarShareService = PlottingCalendarShareService;
