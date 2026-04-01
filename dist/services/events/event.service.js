"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventService = void 0;
const zod_1 = require("zod");
const event_types_1 = require("./event.types");
const notification_service_1 = require("../notifications/notification.service");
function getEventWorkflowScope(extraData) {
    const asRecord = extraData && typeof extraData === 'object' && !Array.isArray(extraData)
        ? extraData
        : {};
    const geoScopeRaw = asRecord.geo_scope;
    const geoScope = geoScopeRaw && typeof geoScopeRaw === 'object' && !Array.isArray(geoScopeRaw)
        ? geoScopeRaw
        : null;
    return { geoScope };
}
const EventCreateSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid(),
    title: zod_1.z.string().trim().min(3),
    address: zod_1.z.string().trim().min(1),
    type: zod_1.z.enum(['blood_drive', 'training', 'advocacy', 'assembly']),
    event_date: zod_1.z.string().date(),
    start_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
    end_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
    description: zod_1.z.string().trim().optional().nullable(),
    image_url: zod_1.z.string().url().optional().nullable(),
    extra_data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    status: zod_1.z.enum(['requested', 'pending', 'approved', 'rejected', 'rescheduled', 'completed']).optional(),
    requested_by_user_id: zod_1.z.string().uuid().optional().nullable(),
    is_public: zod_1.z.boolean().optional(),
});
const EventUpdateSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(3).optional(),
    address: zod_1.z.string().trim().min(1).optional(),
    type: zod_1.z.enum(['blood_drive', 'training', 'advocacy', 'assembly']).optional(),
    event_date: zod_1.z.string().date().optional(),
    start_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional(),
    end_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional(),
    description: zod_1.z.string().trim().optional().nullable(),
    image_url: zod_1.z.string().url().optional().nullable(),
    extra_data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    status: zod_1.z.enum(['requested', 'pending', 'approved', 'rejected', 'rescheduled', 'completed']).optional(),
    completed_at: zod_1.z.string().datetime().optional().nullable(),
    actual_collected_bags: zod_1.z.number().int().min(0).optional().nullable(),
    actual_donors: zod_1.z.number().int().min(0).optional().nullable(),
    wastage_units: zod_1.z.number().int().min(0).optional().nullable(),
    post_event_notes: zod_1.z.string().trim().optional().nullable(),
    post_event_attachments: zod_1.z.array(zod_1.z.string().url()).optional(),
    is_public: zod_1.z.boolean().optional(),
});
const EventFilterSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid().optional(),
    statuses: zod_1.z.array(zod_1.z.enum(['requested', 'pending', 'approved', 'rejected', 'rescheduled', 'completed'])).optional(),
    types: zod_1.z.array(zod_1.z.enum(['blood_drive', 'training', 'advocacy', 'assembly'])).optional(),
    from_date: zod_1.z.string().date().optional(),
    to_date: zod_1.z.string().date().optional(),
    requested_by_user_id: zod_1.z.string().uuid().optional(),
    include_public: zod_1.z.boolean().optional(),
    search: zod_1.z.string().trim().optional(),
    limit: zod_1.z.number().int().min(1).max(500).optional(),
    offset: zod_1.z.number().int().min(0).optional(),
});
const PublicEventFilterSchema = zod_1.z.object({
    from_date: zod_1.z.string().date().optional(),
    to_date: zod_1.z.string().date().optional(),
    types: zod_1.z.array(zod_1.z.enum(['blood_drive', 'training', 'advocacy', 'assembly'])).optional(),
    search: zod_1.z.string().trim().optional(),
    limit: zod_1.z.number().int().min(1).max(500).optional(),
    offset: zod_1.z.number().int().min(0).optional(),
});
class EventService {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
    }
    async notifyReviewersForEvent(params) {
        const { data: users, error } = await this.supabase
            .from('users')
            .select('*')
            .eq('org_id', params.event.org_id)
            .eq('is_active', true);
        if (error) {
            return;
        }
        const workflowScope = getEventWorkflowScope(params.event.extra_data);
        const eventGeoScope = workflowScope.geoScope;
        const reviewers = (users ?? []).filter((user) => {
            if (user.id === params.actor.id) {
                return false;
            }
            if (user.role.type === 'super_admin') {
                return true;
            }
            const permissions = user.role.permissions ?? [];
            const hasApprovePermission = permissions.includes('*') || permissions.includes('approve_events');
            const isCoordinator = user.role.type === 'coordinator' || user.role.type === 'admin';
            if (!hasApprovePermission && !isCoordinator) {
                return false;
            }
            return (0, event_types_1.isGeoAreaMatch)(eventGeoScope, user.geographic_area);
        });
        if (reviewers.length === 0) {
            return;
        }
        const actorResult = await this.getActorById(params.actor.id);
        const actorName = actorResult.data
            ? [actorResult.data.first_name, actorResult.data.last_name].filter(Boolean).join(' ').trim() || 'A requester'
            : 'A requester';
        await Promise.allSettled(reviewers.map(async (reviewer) => {
            await notification_service_1.notificationService.notifyReviewNeeded({
                org_id: params.event.org_id,
                reviewer_user_id: reviewer.id,
                actor_user_id: params.actor.id,
                actor_name: actorName,
                event_id: params.event.id,
                event_name: params.event.title,
                notes: params.notes,
            });
        }));
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
    async withLatestApproval(events) {
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
                error: (0, event_types_1.toServiceError)('EVENT_LATEST_APPROVAL_LOOKUP_FAILED', 'Failed to fetch latest approval details.', error),
            };
        }
        const latestByEventId = new Map();
        for (const row of (data ?? [])) {
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
    async enrichEvents(events) {
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
            if (!event.is_public || event.status !== 'approved') {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('EVENT_NOT_VISIBLE', 'Event is not publicly visible.'),
                };
            }
            const enriched = await this.enrichEvents([event]);
            if (enriched.error || !enriched.data?.[0]) {
                return { data: null, error: enriched.error };
            }
            return { data: enriched.data[0], error: null };
        }
        const isSameOrg = event.org_id === actor.org_id;
        const canViewOrgEvents = (0, event_types_1.hasRoleAtLeast)(actor, 'staff') || (0, event_types_1.hasPermission)(actor, 'view_events');
        if (!isSameOrg && !event.is_public) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_NOT_VISIBLE', 'Event is outside your organization scope.'),
            };
        }
        if (isSameOrg && !canViewOrgEvents && event.requested_by_user_id !== actor.id && !event.is_public) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to view this event.'),
            };
        }
        const workflowScope = getEventWorkflowScope(event.extra_data);
        if (isSameOrg && !(0, event_types_1.isGeoAreaMatch)(actor.geographic_area, workflowScope.geoScope)) {
            if (!(0, event_types_1.hasRoleAtLeast)(actor, 'admin')) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('EVENT_NOT_VISIBLE', 'Event is outside your geographic area.'),
                };
            }
        }
        const enriched = await this.enrichEvents([event]);
        if (enriched.error || !enriched.data?.[0]) {
            return { data: null, error: enriched.error };
        }
        return { data: enriched.data[0], error: null };
    }
    parseTimeToMinutes(timeValue) {
        const [h, m] = timeValue.split(':');
        return Number(h) * 60 + Number(m);
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
                error: (0, event_types_1.toServiceError)('ADVANCE_DAYS_VIOLATION', `Event must be requested at least ${settings.event_request_advance_days} days in advance.`),
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
        const bannedDates = new Set((settings.banned_specific_dates ?? []).map((d) => d.trim()));
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
        const { count, error: countError } = await this.supabase
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', payload.org_id)
            .eq('event_date', payload.event_date)
            .in('status', ['requested', 'pending', 'approved', 'rescheduled']);
        if (countError) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_COUNT_LOOKUP_FAILED', 'Failed to validate daily event limit.', countError),
            };
        }
        const eventCount = count ?? 0;
        if (eventCount >= settings.max_events_per_day) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('MAX_EVENTS_PER_DAY_EXCEEDED', 'Maximum events per day has been reached.'),
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
                    error: (0, event_types_1.toServiceError)('DOUBLE_BOOKING_CHECK_FAILED', 'Failed to validate double booking.', sameDayError),
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
                    error: (0, event_types_1.toServiceError)('DOUBLE_BOOKING_NOT_ALLOWED', 'Event time conflicts with an existing event.'),
                };
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
    async createEvent(actor, input) {
        try {
            if (!actor.is_active) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'Inactive users cannot create events.'),
                };
            }
            const parsed = EventCreateSchema.parse(input);
            if (parsed.org_id !== actor.org_id) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You can only create events in your own organization.'),
                };
            }
            if (!(0, event_types_1.hasPermission)(actor, 'create_events') && !(0, event_types_1.hasRoleAtLeast)(actor, 'coordinator')) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to create events.'),
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
            const canAutoApprove = (0, event_types_1.hasRoleAtLeast)(actor, 'admin') || (0, event_types_1.hasPermission)(actor, 'auto_approve_events');
            const requestedAutoApprove = parsed.status === 'approved';
            if (requestedAutoApprove && !canAutoApprove) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'Only admin roles can auto-approve events on creation.'),
                };
            }
            const status = requestedAutoApprove
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
                    error: (0, event_types_1.toServiceError)('EVENT_CREATE_FAILED', 'Failed to create event.', error),
                };
            }
            const created = data;
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
            if (['requested', 'pending'].includes(created.status)) {
                await this.notifyReviewersForEvent({
                    event: created,
                    actor,
                    notes: 'Event submitted for review.',
                });
            }
            return { data: created, error: null };
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_CREATE_VALIDATION_ERROR', 'Invalid event payload.', error),
            };
        }
    }
    async updateEvent(actor, eventId, input) {
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
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'Cannot update events from a different organization.'),
                };
            }
            const canEdit = (0, event_types_1.hasPermission)(actor, 'manage_events') ||
                (0, event_types_1.hasPermission)(actor, 'edit_events') ||
                (0, event_types_1.hasRoleAtLeast)(actor, 'coordinator') ||
                existing.requested_by_user_id === actor.id;
            if (!canEdit) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to update this event.'),
                };
            }
            if (parsed.status && !(0, event_types_1.canTransitionEventStatus)(existing.status, parsed.status)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('INVALID_STATUS_TRANSITION', `Invalid status transition: ${existing.status} -> ${parsed.status}.`),
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
                if (updated.status === 'pending') {
                    await this.notifyReviewersForEvent({
                        event: updated,
                        actor,
                        notes: 'Event requires review.',
                    });
                }
            }
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
        const canDelete = (0, event_types_1.hasPermission)(actor, 'manage_events') ||
            (0, event_types_1.hasPermission)(actor, 'edit_events') ||
            (0, event_types_1.hasRoleAtLeast)(actor, 'admin');
        if (!canDelete) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to delete this event.'),
            };
        }
        if (!['requested', 'rejected'].includes(existing.status)) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('INVALID_STATUS_TRANSITION', 'Only requested or rejected events can be deleted.'),
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
    isEventVisibleToActor(event, actor) {
        if (event.org_id !== actor.org_id) {
            return event.is_public;
        }
        if ((0, event_types_1.hasRoleAtLeast)(actor, 'admin') || (0, event_types_1.hasPermission)(actor, 'manage_events')) {
            return true;
        }
        const hasViewPermission = (0, event_types_1.hasRoleAtLeast)(actor, 'staff') ||
            (0, event_types_1.hasPermission)(actor, 'view_events') ||
            (0, event_types_1.hasPermission)(actor, 'events.read');
        const hasReviewPermission = (0, event_types_1.hasPermission)(actor, 'approve_events') ||
            (0, event_types_1.hasPermission)(actor, 'events.approve');
        const isRequester = event.requested_by_user_id === actor.id;
        const hasEventScopePermission = hasViewPermission || hasReviewPermission || isRequester;
        if (!hasEventScopePermission && !event.is_public) {
            return false;
        }
        const workflowScope = getEventWorkflowScope(event.extra_data);
        const eventGeoScope = workflowScope.geoScope;
        return (0, event_types_1.isGeoAreaMatch)(eventGeoScope, actor.geographic_area);
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
            if (parsed.org_id) {
                query = query.eq('org_id', parsed.org_id);
            }
            else {
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
                    error: (0, event_types_1.toServiceError)('EVENT_LIST_FAILED', 'Failed to list events.', error),
                };
            }
            const rows = data ?? [];
            const visible = rows.filter((event) => this.isEventVisibleToActor(event, actor));
            const withPublic = parsed.include_public
                ? [
                    ...visible,
                    ...rows.filter((event) => event.is_public && event.org_id !== actor.org_id),
                ]
                : visible;
            const uniqueById = new Map();
            for (const event of withPublic) {
                uniqueById.set(event.id, event);
            }
            let result = Array.from(uniqueById.values());
            if (parsed.search) {
                const q = parsed.search.toLowerCase();
                result = result.filter((event) => (0, event_types_1.buildEventSearchText)(event).includes(q));
            }
            const enriched = await this.enrichEvents(result);
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
                    error: (0, event_types_1.toServiceError)('PUBLIC_EVENT_LIST_FAILED', 'Failed to fetch public events.', error),
                };
            }
            let rows = data ?? [];
            if (parsed.search) {
                const q = parsed.search.toLowerCase();
                rows = rows.filter((event) => (0, event_types_1.buildEventSearchText)(event).includes(q));
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
    async updatePublishedEventStatus(actor, eventId, params) {
        const eventResult = await this.getEventById(eventId, actor);
        if (eventResult.error || !eventResult.data) {
            return { data: null, error: eventResult.error };
        }
        const event = eventResult.data;
        if (event.org_id !== actor.org_id) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'Cannot modify an event from another organization.'),
            };
        }
        if (event.status !== 'approved') {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('INVALID_STATUS_TRANSITION', 'Only approved events can be canceled or rescheduled.'),
            };
        }
        const canManage = (0, event_types_1.hasPermission)(actor, 'manage_events') || (0, event_types_1.hasPermission)(actor, 'approve_events') || (0, event_types_1.hasRoleAtLeast)(actor, 'coordinator');
        if (!canManage) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to change published events.'),
            };
        }
        const patch = {
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
                error: (0, event_types_1.toServiceError)('EVENT_STATUS_UPDATE_FAILED', 'Failed to update published event status.', error),
            };
        }
        const updated = data;
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
            message: params.actionType === 'event_cancelled'
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
    async cancelPublishedEvent(actor, eventId, notes) {
        return this.updatePublishedEventStatus(actor, eventId, {
            targetStatus: 'rejected',
            actionType: 'event_cancelled',
            eventApprovalAction: 'reject',
            notes,
        });
    }
    async reschedulePublishedEvent(actor, eventId, input) {
        const parsed = zod_1.z
            .object({
            event_date: zod_1.z.string().date(),
            start_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
            end_time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
            notes: zod_1.z.string().trim().optional().nullable(),
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
    subscribeToEventUpdates(orgId, handlers) {
        const channel = this.supabase
            .channel(`events:${orgId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `org_id=eq.${orgId}` }, (payload) => {
            if (handlers.onInsert) {
                handlers.onInsert(payload.new);
            }
        })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `org_id=eq.${orgId}` }, (payload) => {
            if (handlers.onUpdate) {
                handlers.onUpdate(payload.new);
            }
        })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'events', filter: `org_id=eq.${orgId}` }, (payload) => {
            if (handlers.onDelete) {
                handlers.onDelete(payload.old);
            }
        })
            .subscribe();
        return channel;
    }
    async buildActorContext(userId) {
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
exports.EventService = EventService;
