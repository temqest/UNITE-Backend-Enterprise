"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventService = void 0;
const zod_1 = require("zod");
const event_types_1 = require("./event.types");
const geo_1 = require("../../utils/geo");
const eventTypeSchema = zod_1.z.enum(['blood_drive', 'training', 'advocacy', 'assembly']);
const eventStatusSchema = zod_1.z.enum(['draft', 'plotted', 'needs_details', 'scheduled', 'published', 'ongoing', 'completed', 'cancelled']);
const eventSetupStatusSchema = zod_1.z.enum(['needs_details', 'pending_setup', 'complete']);
const eventCreationMethodSchema = zod_1.z.enum(['manual', 'plotting_calendar']);
const eventVisibilitySchema = zod_1.z.enum(['internal', 'public']);
const EventCreateSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid(),
    title: zod_1.z.string().trim().min(3),
    address: zod_1.z.string().trim().min(1).optional().nullable(),
    type: eventTypeSchema,
    event_date: zod_1.z.string().date(),
    start_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
    end_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
    description: zod_1.z.string().trim().optional().nullable(),
    image_url: zod_1.z.string().url().optional().nullable(),
    extra_data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional().default({}),
    status: eventStatusSchema.optional(),
    setup_status: eventSetupStatusSchema.optional(),
    setup_completed_at: zod_1.z.string().datetime().optional().nullable(),
    creation_method: eventCreationMethodSchema.optional(),
    plotting_calendar_id: zod_1.z.string().uuid().optional().nullable(),
    hosting_organization: zod_1.z.string().trim().optional().nullable(),
    visibility: eventVisibilitySchema.optional(),
    requested_by_user_id: zod_1.z.string().uuid().optional().nullable(),
    is_public: zod_1.z.boolean().optional(),
    coverage_area_id: zod_1.z.string().uuid().optional().nullable(),
    coverage_area_psgc_code: zod_1.z.string().trim().optional().nullable(),
    coverage_area_boundary_id: zod_1.z.string().trim().optional().nullable(),
    coverage_area_name: zod_1.z.string().trim().optional().nullable(),
    coverage_area_province: zod_1.z.string().trim().optional().nullable(),
    coverage_area_municipality: zod_1.z.string().trim().optional().nullable(),
    coverage_area_barangay: zod_1.z.string().trim().optional().nullable(),
    coverage_area_normalized_key: zod_1.z.string().trim().optional().nullable(),
    created_by: zod_1.z.string().uuid().optional().nullable(),
    updated_by: zod_1.z.string().uuid().optional().nullable(),
}).superRefine((value, context) => {
    if (value.start_time && value.end_time && value.start_time >= value.end_time) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['end_time'],
            message: 'end_time must be later than start_time.',
        });
    }
});
const EventUpdateSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(3).optional(),
    address: zod_1.z.string().trim().min(1).optional().nullable(),
    type: eventTypeSchema.optional(),
    event_date: zod_1.z.string().date().optional(),
    start_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
    end_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
    description: zod_1.z.string().trim().optional().nullable(),
    image_url: zod_1.z.string().url().optional().nullable(),
    extra_data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    status: eventStatusSchema.optional(),
    setup_status: eventSetupStatusSchema.optional(),
    setup_completed_at: zod_1.z.string().datetime().optional().nullable(),
    creation_method: eventCreationMethodSchema.optional(),
    plotting_calendar_id: zod_1.z.string().uuid().optional().nullable(),
    hosting_organization: zod_1.z.string().trim().optional().nullable(),
    visibility: eventVisibilitySchema.optional(),
    completed_at: zod_1.z.string().datetime().optional().nullable(),
    actual_collected_bags: zod_1.z.number().int().min(0).optional().nullable(),
    actual_donors: zod_1.z.number().int().min(0).optional().nullable(),
    wastage_units: zod_1.z.number().int().min(0).optional().nullable(),
    post_event_notes: zod_1.z.string().trim().optional().nullable(),
    post_event_attachments: zod_1.z.array(zod_1.z.string().url()).optional(),
    is_public: zod_1.z.boolean().optional(),
    coverage_area_id: zod_1.z.string().uuid().optional().nullable(),
    coverage_area_psgc_code: zod_1.z.string().trim().optional().nullable(),
    coverage_area_boundary_id: zod_1.z.string().trim().optional().nullable(),
    coverage_area_name: zod_1.z.string().trim().optional().nullable(),
    coverage_area_province: zod_1.z.string().trim().optional().nullable(),
    coverage_area_municipality: zod_1.z.string().trim().optional().nullable(),
    coverage_area_barangay: zod_1.z.string().trim().optional().nullable(),
    coverage_area_normalized_key: zod_1.z.string().trim().optional().nullable(),
    updated_by: zod_1.z.string().uuid().optional().nullable(),
}).superRefine((value, context) => {
    if (value.start_time && value.end_time && value.start_time >= value.end_time) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['end_time'],
            message: 'end_time must be later than start_time.',
        });
    }
});
const QuickEventCreateSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid().optional(),
    title: zod_1.z.string().trim().min(3),
    type: eventTypeSchema,
    event_date: zod_1.z.string().date(),
    venue_name: zod_1.z.string().trim().optional().nullable(),
    municipality: zod_1.z.string().trim().optional().nullable(),
    province: zod_1.z.string().trim().optional().nullable(),
    start_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
    end_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
    hosting_organization: zod_1.z.string().trim().optional().nullable(),
}).superRefine((value, context) => {
    if (value.start_time && value.end_time && value.start_time >= value.end_time) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['end_time'],
            message: 'end_time must be later than start_time.',
        });
    }
});
const CompleteEventDetailsSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(3).optional(),
    type: eventTypeSchema.optional(),
    event_date: zod_1.z.string().date().optional(),
    start_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
    end_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
    address: zod_1.z.string().trim().optional().nullable(),
    description: zod_1.z.string().trim().optional().nullable(),
    image_url: zod_1.z.string().url().optional().nullable(),
    status_action: zod_1.z.enum(['draft', 'pending_setup', 'scheduled', 'publish']).optional(),
    is_public: zod_1.z.boolean().optional(),
    visibility: eventVisibilitySchema.optional(),
    hosting_organization: zod_1.z.string().trim().optional().nullable(),
    extra_data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    assigned_staff_ids: zod_1.z.array(zod_1.z.string().uuid()).optional(),
    coverage_area_id: zod_1.z.string().uuid().optional().nullable(),
    coverage_area_psgc_code: zod_1.z.string().trim().optional().nullable(),
    coverage_area_boundary_id: zod_1.z.string().trim().optional().nullable(),
    coverage_area_name: zod_1.z.string().trim().optional().nullable(),
    coverage_area_province: zod_1.z.string().trim().optional().nullable(),
    coverage_area_municipality: zod_1.z.string().trim().optional().nullable(),
    coverage_area_barangay: zod_1.z.string().trim().optional().nullable(),
    coverage_area_normalized_key: zod_1.z.string().trim().optional().nullable(),
}).superRefine((value, context) => {
    if (value.start_time && value.end_time && value.start_time >= value.end_time) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['end_time'],
            message: 'end_time must be later than start_time.',
        });
    }
});
const EventFilterSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid().optional(),
    statuses: zod_1.z.array(eventStatusSchema).optional(),
    setup_statuses: zod_1.z.array(eventSetupStatusSchema).optional(),
    creation_methods: zod_1.z.array(eventCreationMethodSchema).optional(),
    types: zod_1.z.array(eventTypeSchema).optional(),
    from_date: zod_1.z.string().date().optional(),
    to_date: zod_1.z.string().date().optional(),
    requested_by_user_id: zod_1.z.string().uuid().optional(),
    include_public: zod_1.z.boolean().optional(),
    hosting_organization: zod_1.z.string().trim().optional(),
    search: zod_1.z.string().trim().optional(),
    limit: zod_1.z.number().int().min(1).max(500).optional(),
    offset: zod_1.z.number().int().min(0).optional(),
});
const PublicEventFilterSchema = zod_1.z.object({
    from_date: zod_1.z.string().date().optional(),
    to_date: zod_1.z.string().date().optional(),
    types: zod_1.z.array(eventTypeSchema).optional(),
    province: zod_1.z.string().trim().optional(),
    city: zod_1.z.string().trim().optional(),
    search: zod_1.z.string().trim().optional(),
    limit: zod_1.z.number().int().min(1).max(500).optional(),
    offset: zod_1.z.number().int().min(0).optional(),
});
const EventStatusUpdateSchema = zod_1.z.object({
    event_id: zod_1.z.string().uuid(),
    status: eventStatusSchema,
    notes: zod_1.z.string().trim().optional().nullable(),
});
function normalizeExtraData(extraData) {
    if (!extraData || typeof extraData !== 'object' || Array.isArray(extraData)) {
        return {};
    }
    return { ...extraData };
}
function getTextValue(record, key) {
    const value = record[key];
    return typeof value === 'string' ? value.trim() : '';
}
function getNumberValue(record, key) {
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
function getArrayCount(record, key) {
    const value = record[key];
    return Array.isArray(value) ? value.length : 0;
}
function extraValueToString(extraData, key) {
    if (!extraData || typeof extraData !== 'object' || Array.isArray(extraData)) {
        return '';
    }
    const value = extraData[key];
    return typeof value === 'string' ? value.trim() : '';
}
function isPublishedVisibility(event) {
    return (event.status === 'published' &&
        event.setup_status === 'complete' &&
        (event.visibility === 'public' || event.is_public === true));
}
class EventService {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
    }
    async autoMatchCoverageArea(orgId, event) {
        if (event.coverage_area_id) {
            return event.coverage_area_id;
        }
        if (!event.coverage_area_psgc_code && !event.coverage_area_normalized_key) {
            return null;
        }
        let query = this.supabase.from('organization_coverage_areas').select('id').eq('org_id', orgId);
        if (event.coverage_area_psgc_code && event.coverage_area_normalized_key) {
            query = query.or(`psgc_code.eq.${event.coverage_area_psgc_code},normalized_area_key.eq.${event.coverage_area_normalized_key}`);
        }
        else if (event.coverage_area_psgc_code) {
            query = query.eq('psgc_code', event.coverage_area_psgc_code);
        }
        else if (event.coverage_area_normalized_key) {
            query = query.eq('normalized_area_key', event.coverage_area_normalized_key);
        }
        const { data } = await query.maybeSingle();
        return data ? data.id : null;
    }
    async getActorById(userId) {
        const { data, error } = await this.supabase.from('users').select('*').eq('id', userId).single();
        if (error || !data) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('ACTOR_NOT_FOUND', 'Requesting user was not found.', error),
            };
        }
        return { data: data, error: null };
    }
    async withRequester(events) {
        const requesterIds = Array.from(new Set(events.map((event) => event.requested_by_user_id).filter((id) => typeof id === 'string' && id.length > 0)));
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
                error: (0, event_types_1.toServiceError)('EVENT_REQUESTER_LOOKUP_FAILED', 'Failed to fetch event requester details.', error),
            };
        }
        const requesterMap = new Map();
        for (const row of (data ?? [])) {
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
    async enrichEvents(events) {
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
    async getOrganizationSettings(orgId) {
        const { data, error } = await this.supabase
            .from('organization_settings')
            .select('*')
            .eq('org_id', orgId)
            .maybeSingle();
        if (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('ORG_SETTINGS_LOOKUP_FAILED', 'Failed to fetch organization settings.', error),
            };
        }
        return { data: data ?? null, error: null };
    }
    parseTimeToMinutes(timeValue) {
        const [hours, minutes] = timeValue.split(':');
        return Number(hours) * 60 + Number(minutes);
    }
    async validateCreationAgainstSettings(payload, settings) {
        if (!settings) {
            return { data: true, error: null };
        }
        const eventDate = new Date(`${payload.event_date}T00:00:00.000Z`);
        const now = new Date();
        const daysDiff = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff < settings.event_request_advance_days) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('ADVANCE_DAYS_VIOLATION', `Event must be created at least ${settings.event_request_advance_days} days in advance.`),
            };
        }
        const dayOfWeek = eventDate.getUTCDay();
        const bannedDays = settings.banned_days_of_week ?? [];
        if (bannedDays.includes(dayOfWeek)) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('BANNED_DAY_VIOLATION', 'Selected event day is not allowed by organization settings.'),
            };
        }
        const bannedDates = new Set((settings.banned_specific_dates ?? []).map((value) => value.trim()));
        if (bannedDates.has(payload.event_date)) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('BANNED_DATE_VIOLATION', 'Selected event date is blocked by organization settings.'),
            };
        }
        if (!settings.allow_weekend_events && (dayOfWeek === 0 || dayOfWeek === 6)) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('WEEKEND_NOT_ALLOWED', 'Weekend events are not allowed for this organization.'),
            };
        }
        const activeStatuses = ['plotted', 'needs_details', 'scheduled', 'published', 'ongoing'];
        const { data: sameDayEvents, error: sameDayError } = await this.supabase
            .from('events')
            .select('id, start_time, end_time')
            .eq('org_id', payload.org_id)
            .eq('event_date', payload.event_date)
            .in('status', activeStatuses);
        if (sameDayError) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_COUNT_LOOKUP_FAILED', 'Failed to validate organization event limits.', sameDayError),
            };
        }
        const filteredSameDayEvents = (sameDayEvents ?? [])
            .filter((event) => event.id !== payload.exclude_event_id);
        if (payload.creation_method !== 'plotting_calendar') {
            if (filteredSameDayEvents.length >= settings.max_events_per_day) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('MAX_EVENTS_PER_DAY_EXCEEDED', 'Maximum events per day has been reached.'),
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
                        error: (0, event_types_1.toServiceError)('DOUBLE_BOOKING_NOT_ALLOWED', 'Event time conflicts with an existing event.'),
                    };
                }
            }
        }
        return { data: true, error: null };
    }
    async createNotification(params) {
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
    async createSystemLog(params) {
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
    async getAssignedStaffCount(eventId) {
        const { count, error } = await this.supabase
            .from('event_staff')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', eventId);
        if (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_STAFF_COUNT_FAILED', 'Failed to check event staff assignments.', error),
            };
        }
        return { data: count ?? 0, error: null };
    }
    async syncAssignedStaff(params) {
        const uniqueIds = Array.from(new Set(params.userIds.filter(Boolean)));
        const { error: deleteError } = await this.supabase
            .from('event_staff')
            .delete()
            .eq('event_id', params.event.id)
            .eq('org_id', params.event.org_id);
        if (deleteError) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_STAFF_SYNC_FAILED', 'Failed to clear previous staff assignments.', deleteError),
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
                error: (0, event_types_1.toServiceError)('EVENT_STAFF_SYNC_FAILED', 'Failed to assign event staff.', insertError),
            };
        }
        return { data: true, error: null };
    }
    async validatePublishReadiness(event) {
        const missing = [];
        if (!event.title?.trim())
            missing.push('Event title');
        if (!event.type)
            missing.push('Event type');
        if (!event.event_date)
            missing.push('Event date');
        if (!event.hosting_organization?.trim())
            missing.push('Hosting organization');
        if (!event.coverage_area_boundary_id && !event.coverage_area_municipality) {
            missing.push('Event Area (City / Municipality)');
        }
        if (missing.length > 0) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_SETUP_INCOMPLETE', 'Please complete the required fields before publishing.', { missing }),
            };
        }
        return { data: true, error: null };
    }
    canViewOrgEvent(actor, event) {
        const sameOrg = event.org_id === actor.org_id;
        if (!sameOrg) {
            return isPublishedVisibility(event);
        }
        if ((0, event_types_1.hasRoleAtLeast)(actor, 'admin') || (0, event_types_1.hasPermission)(actor, 'events.read')) {
            return true;
        }
        if (event.requested_by_user_id === actor.id) {
            return true;
        }
        if (!(0, event_types_1.hasRoleAtLeast)(actor, 'staff') && !event.is_public) {
            return false;
        }
        const geoScopeRaw = normalizeExtraData(event.extra_data).geo_scope;
        const geoScope = geoScopeRaw && typeof geoScopeRaw === 'object' && !Array.isArray(geoScopeRaw)
            ? geoScopeRaw
            : null;
        return (0, event_types_1.isGeoAreaMatch)(actor.geographic_area, geoScope);
    }
    canEditEvent(actor, event) {
        return (event.org_id === actor.org_id &&
            (event.requested_by_user_id === actor.id ||
                (0, event_types_1.hasRoleAtLeast)(actor, 'coordinator') ||
                (0, event_types_1.hasPermission)(actor, 'events.update')));
    }
    canPublishEvent(actor) {
        return ((0, event_types_1.hasRoleAtLeast)(actor, 'coordinator') ||
            (0, event_types_1.hasPermission)(actor, 'events.approve') ||
            ((0, event_types_1.hasPermission)(actor, 'events.update') && (0, event_types_1.hasRoleAtLeast)(actor, 'admin')));
    }
    canCancelEvent(actor) {
        return this.canPublishEvent(actor) || (0, event_types_1.hasPermission)(actor, 'events.update');
    }
    async validateEventWindow(event) {
        if (!event.start_time || !event.end_time) {
            return { data: true, error: null };
        }
        const settingsResult = await this.getOrganizationSettings(event.org_id);
        if (settingsResult.error) {
            return { data: null, error: settingsResult.error };
        }
        return this.validateCreationAgainstSettings({
            org_id: event.org_id,
            event_date: event.event_date,
            start_time: event.start_time,
            end_time: event.end_time,
            exclude_event_id: event.id,
            creation_method: event.creation_method,
        }, settingsResult.data);
    }
    async getEventById(eventId, actor) {
        const { data, error } = await this.supabase.from('events').select('*').eq('id', eventId).single();
        if (error || !data) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_NOT_FOUND', 'Event was not found.', error),
            };
        }
        const event = data;
        if (!actor) {
            if (!isPublishedVisibility(event)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('EVENT_NOT_VISIBLE', 'Event is not publicly visible.'),
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
                error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to view this event.'),
            };
        }
        const enriched = await this.enrichEvents([event]);
        return enriched.error || !enriched.data?.[0]
            ? { data: null, error: enriched.error }
            : { data: enriched.data[0], error: null };
    }
    async quickCreateEvent(actor, input) {
        try {
            if (!actor.is_active) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'Inactive users cannot create events.'),
                };
            }
            if (!(0, event_types_1.hasPermission)(actor, 'events.create') && !(0, event_types_1.hasRoleAtLeast)(actor, 'coordinator')) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to create events.'),
                };
            }
            const parsed = QuickEventCreateSchema.parse(input);
            const orgId = parsed.org_id ?? actor.org_id;
            if (orgId !== actor.org_id) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You can only create events in your own organization.'),
                };
            }
            const extraData = {
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
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_QUICK_CREATE_VALIDATION_ERROR', 'Invalid quick event payload.', error),
            };
        }
    }
    async createEvent(actor, input) {
        try {
            if (!actor.is_active) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'Inactive users cannot create events.'),
                };
            }
            if (!(0, event_types_1.hasPermission)(actor, 'events.create') && !(0, event_types_1.hasRoleAtLeast)(actor, 'coordinator')) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to create events.'),
                };
            }
            const parsed = EventCreateSchema.parse(input);
            if (parsed.org_id !== actor.org_id) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You can only create events in your own organization.'),
                };
            }
            let status = parsed.status ?? 'draft';
            let setupStatus = parsed.setup_status ?? (status === 'scheduled' || status === 'published' ? 'complete' : 'needs_details');
            let visibility = parsed.visibility ?? (status === 'published' || parsed.is_public ? 'public' : 'internal');
            let isPublic = parsed.is_public ?? visibility === 'public';
            if (status === 'published') {
                if (!this.canPublishEvent(actor)) {
                    return {
                        data: null,
                        error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to publish events.'),
                    };
                }
                setupStatus = 'complete';
                visibility = 'public';
                isPublic = true;
            }
            else if (status === 'scheduled') {
                setupStatus = 'complete';
                visibility = 'internal';
                isPublic = false;
            }
            else if (status === 'plotted' || status === 'needs_details') {
                setupStatus = 'needs_details';
                visibility = 'internal';
                isPublic = false;
            }
            const eventForValidation = {
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
                coverage_area_normalized_key: (parsed.coverage_area_normalized_key ?? (0, geo_1.normalizeGeoAreaKey)({
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
                    error: (0, event_types_1.toServiceError)('EVENT_CREATE_FAILED', 'Failed to create event.', error),
                };
            }
            const created = data;
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
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_CREATE_VALIDATION_ERROR', 'Invalid event payload.', error),
            };
        }
    }
    async completeEventDetails(actor, eventId, input) {
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
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to complete this event setup.'),
                };
            }
            const extraData = {
                ...normalizeExtraData(existing.extra_data),
                ...(parsed.extra_data ?? {}),
            };
            const action = parsed.status_action ?? 'pending_setup';
            let status = existing.status;
            let setupStatus = existing.setup_status;
            let visibility = parsed.visibility ?? existing.visibility;
            let isPublic = parsed.is_public ?? existing.is_public;
            if (action === 'draft') {
                status = existing.creation_method === 'plotting_calendar' ? 'plotted' : 'draft';
                setupStatus = 'needs_details';
                visibility = 'internal';
                isPublic = false;
            }
            else if (action === 'pending_setup') {
                status = 'needs_details';
                setupStatus = 'pending_setup';
                visibility = 'internal';
                isPublic = false;
            }
            else if (action === 'scheduled') {
                status = 'scheduled';
                setupStatus = 'complete';
                visibility = 'internal';
                isPublic = false;
            }
            else if (action === 'publish') {
                if (!this.canPublishEvent(actor)) {
                    return {
                        data: null,
                        error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to publish events.'),
                    };
                }
                status = 'published';
                setupStatus = 'complete';
                visibility = 'public';
                isPublic = true;
                extraData.public_registration_enabled = true;
                extraData.allow_donor_signup = true;
            }
            const patch = {
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
            const candidate = {
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
            if (!(0, event_types_1.canTransitionEventStatus)(existing.status, candidate.status)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('INVALID_STATUS_TRANSITION', `Invalid status transition: ${existing.status} -> ${candidate.status}.`),
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
                    error: (0, event_types_1.toServiceError)('EVENT_COMPLETE_DETAILS_FAILED', 'Failed to save event setup details.', error),
                };
            }
            const updated = data;
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
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_COMPLETE_DETAILS_VALIDATION_ERROR', 'Invalid complete details payload.', error),
            };
        }
    }
    async setEventStatus(actor, eventId, input) {
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
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'Cannot update events from a different organization.'),
                };
            }
            if (!this.canEditEvent(actor, existing)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to update this event status.'),
                };
            }
            if (!(0, event_types_1.canTransitionEventStatus)(existing.status, parsed.status)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('INVALID_STATUS_TRANSITION', `Invalid status transition: ${existing.status} -> ${parsed.status}.`),
                };
            }
            let setupStatus = existing.setup_status;
            let visibility = existing.visibility;
            let isPublic = existing.is_public;
            if (parsed.status === 'scheduled') {
                setupStatus = 'complete';
                visibility = 'internal';
                isPublic = false;
            }
            else if (parsed.status === 'published') {
                if (!this.canPublishEvent(actor)) {
                    return {
                        data: null,
                        error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to publish events.'),
                    };
                }
                setupStatus = 'complete';
                visibility = 'public';
                isPublic = true;
            }
            else if (parsed.status === 'cancelled') {
                if (!this.canCancelEvent(actor)) {
                    return {
                        data: null,
                        error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to cancel events.'),
                    };
                }
            }
            const candidate = {
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
                    error: (0, event_types_1.toServiceError)('EVENT_STATUS_UPDATE_FAILED', 'Failed to update event status.', error),
                };
            }
            const updated = data;
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
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_STATUS_UPDATE_VALIDATION_ERROR', 'Invalid event status payload.', error),
            };
        }
    }
    async publishEvent(actor, eventId) {
        return this.setEventStatus(actor, eventId, { status: 'published' });
    }
    async updateEvent(actor, eventId, input) {
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
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to update this event.'),
                };
            }
            const mergedExtraData = parsed.extra_data
                ? { ...normalizeExtraData(existing.extra_data), ...normalizeExtraData(parsed.extra_data) }
                : existing.extra_data;
            const nextStatus = parsed.status ?? existing.status;
            if (!(0, event_types_1.canTransitionEventStatus)(existing.status, nextStatus)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('INVALID_STATUS_TRANSITION', `Invalid status transition: ${existing.status} -> ${nextStatus}.`),
                };
            }
            const candidate = {
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
                    candidate.coverage_area_normalized_key = (0, geo_1.normalizeGeoAreaKey)({
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
            const patch = {
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
                    error: (0, event_types_1.toServiceError)('EVENT_UPDATE_FAILED', 'Failed to update event.', error),
                };
            }
            const updated = data;
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
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_UPDATE_VALIDATION_ERROR', 'Invalid event update payload.', error),
            };
        }
    }
    async deleteEvent(actor, eventId) {
        const existingResult = await this.getEventById(eventId, actor);
        if (existingResult.error || !existingResult.data) {
            return { data: null, error: existingResult.error };
        }
        const existing = existingResult.data;
        if (existing.org_id !== actor.org_id) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'Cannot delete events from a different organization.'),
            };
        }
        const canDelete = (0, event_types_1.hasRoleAtLeast)(actor, 'admin') ||
            (0, event_types_1.hasPermission)(actor, 'events.delete') ||
            (0, event_types_1.hasPermission)(actor, 'events.update');
        if (!canDelete) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to delete this event.'),
            };
        }
        if (!['draft', 'plotted', 'needs_details', 'cancelled'].includes(existing.status)) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('INVALID_STATUS_TRANSITION', 'Only draft, plotted, needs details, or cancelled events can be deleted.'),
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
                error: (0, event_types_1.toServiceError)('EVENT_DELETE_FAILED', 'Failed to delete event.', error),
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
    async listEvents(actor, filter = {}) {
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
                    error: (0, event_types_1.toServiceError)('EVENT_LIST_FAILED', 'Failed to list events.', error),
                };
            }
            const rows = (data ?? []).filter((event) => this.canViewOrgEvent(actor, event));
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
                        error: (0, event_types_1.toServiceError)('PUBLIC_EVENT_LIST_FAILED', 'Failed to fetch public events.', publicError),
                    };
                }
                result = [...result, ...(publicRows ?? [])];
            }
            if (parsed.search) {
                const q = parsed.search.toLowerCase();
                result = result.filter((event) => {
                    const extra = normalizeExtraData(event.extra_data);
                    const haystack = [
                        (0, event_types_1.buildEventSearchText)(event),
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
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_LIST_VALIDATION_ERROR', 'Invalid event list filter.', error),
            };
        }
    }
    async listPublicEvents(filter = {}) {
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
                    error: (0, event_types_1.toServiceError)('PUBLIC_EVENT_LIST_FAILED', 'Failed to fetch public events.', error),
                };
            }
            let rows = data ?? [];
            if (parsed.province) {
                const province = parsed.province.trim().toLowerCase();
                rows = rows.filter((event) => extraValueToString(event.extra_data, 'province').toLowerCase() === province);
            }
            if (parsed.city) {
                const city = parsed.city.trim().toLowerCase();
                rows = rows.filter((event) => {
                    const eventCity = extraValueToString(event.extra_data, 'city') ||
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
                        (0, event_types_1.buildEventSearchText)(event),
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
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PUBLIC_EVENT_FILTER_INVALID', 'Invalid public event filter.', error),
            };
        }
    }
    async cancelPublishedEvent(actor, eventId, notes) {
        return this.setEventStatus(actor, eventId, {
            status: 'cancelled',
            notes,
        });
    }
    subscribeToEventUpdates(orgId, handlers) {
        const channel = this.supabase.channel(`events:${orgId}`);
        channel.on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'events',
            filter: `org_id=eq.${orgId}`,
        }, (payload) => {
            if (payload.eventType === 'INSERT' && handlers.onInsert) {
                handlers.onInsert(payload.new);
            }
            else if (payload.eventType === 'UPDATE' && handlers.onUpdate) {
                handlers.onUpdate(payload.new);
            }
            else if (payload.eventType === 'DELETE' && handlers.onDelete) {
                handlers.onDelete(payload.old);
            }
        });
        void channel.subscribe();
        return channel;
    }
}
exports.EventService = EventService;
