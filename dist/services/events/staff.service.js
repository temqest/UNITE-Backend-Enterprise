"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventStaffService = void 0;
const zod_1 = require("zod");
const event_types_1 = require("./event.types");
const AssignStaffSchema = zod_1.z.object({
    event_id: zod_1.z.string().uuid(),
    user_id: zod_1.z.string().uuid(),
    assignment_role: zod_1.z.enum(['lead', 'coordinator', 'staff', 'volunteer']),
    notes: zod_1.z.string().trim().optional().nullable(),
});
const RemoveStaffSchema = zod_1.z.object({
    event_id: zod_1.z.string().uuid(),
    user_id: zod_1.z.string().uuid(),
});
class EventStaffService {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
    }
    async getEvent(eventId) {
        const { data, error } = await this.supabase.from('events').select('*').eq('id', eventId).single();
        if (error || !data) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('EVENT_NOT_FOUND', 'Event was not found.', error),
            };
        }
        return { data: data, error: null };
    }
    async getUser(userId) {
        const { data, error } = await this.supabase.from('users').select('*').eq('id', userId).single();
        if (error || !data) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('USER_NOT_FOUND', 'User was not found.', error),
            };
        }
        return { data: data, error: null };
    }
    async createSystemLog(params) {
        await this.supabase.from('system_logs').insert({
            org_id: params.org_id,
            user_id: params.user_id,
            category: 'staff',
            action_type: params.action_type,
            entity_type: 'event_staff',
            entity_id: params.entity_id,
            payload: params.payload,
            status: 'completed',
        });
    }
    async notifyStaffAssignment(params) {
        await this.supabase.from('notifications').insert({
            org_id: params.org_id,
            user_id: params.assigned_user_id,
            created_by_user_id: params.actor_user_id,
            type: 'event.staff_assigned',
            title: 'Assigned to event',
            message: `You were assigned as ${params.assignment_role} for ${params.event.title}.`,
            data: {
                event_id: params.event.id,
                assignment_role: params.assignment_role,
            },
            priority: 'normal',
        });
    }
    async assignStaff(actor, input) {
        try {
            const parsed = AssignStaffSchema.parse(input);
            const eventResult = await this.getEvent(parsed.event_id);
            if (eventResult.error || !eventResult.data) {
                return { data: null, error: eventResult.error };
            }
            const staffUserResult = await this.getUser(parsed.user_id);
            if (staffUserResult.error || !staffUserResult.data) {
                return { data: null, error: staffUserResult.error };
            }
            const event = eventResult.data;
            const staffUser = staffUserResult.data;
            if (event.org_id !== actor.org_id || staffUser.org_id !== actor.org_id) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'Cross-organization staff assignment is not allowed.'),
                };
            }
            if (!(0, event_types_1.hasPermission)(actor, 'assign_event_staff') && !(0, event_types_1.hasRoleAtLeast)(actor, 'coordinator')) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to assign event staff.'),
                };
            }
            if (!staffUser.is_active) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('INVALID_STAFF_STATE', 'Inactive users cannot be assigned to events.'),
                };
            }
            const isStaffRole = ['staff', 'coordinator', 'admin', 'super_admin', 'volunteer'].includes(staffUser.role.type);
            if (!isStaffRole) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('INVALID_STAFF_ROLE', 'Selected user does not have a staff-compatible role.'),
                };
            }
            const geoAllowed = (0, event_types_1.isGeoAreaMatch)(staffUser.geographic_area, actor.geographic_area);
            if (!geoAllowed && !(0, event_types_1.hasRoleAtLeast)(actor, 'admin')) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('GEO_SCOPE_MISMATCH', 'Staff geographic area does not match assignment scope.'),
                };
            }
            const { data, error } = await this.supabase
                .from('event_staff')
                .upsert({
                org_id: event.org_id,
                event_id: event.id,
                user_id: staffUser.id,
                assignment_role: parsed.assignment_role,
                notes: parsed.notes ?? null,
            }, { onConflict: 'event_id,user_id' })
                .select('*')
                .single();
            if (error || !data) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('STAFF_ASSIGN_FAILED', 'Failed to assign staff to event.', error),
                };
            }
            const assigned = data;
            await this.notifyStaffAssignment({
                org_id: event.org_id,
                assigned_user_id: staffUser.id,
                actor_user_id: actor.id,
                event,
                assignment_role: assigned.assignment_role,
            });
            await this.createSystemLog({
                org_id: event.org_id,
                user_id: actor.id,
                action_type: 'staff_signup',
                entity_id: assigned.id,
                payload: {
                    event_id: event.id,
                    staff_user_id: staffUser.id,
                    assignment_role: assigned.assignment_role,
                },
            });
            return { data: assigned, error: null };
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('STAFF_ASSIGN_VALIDATION_ERROR', 'Invalid staff assignment payload.', error),
            };
        }
    }
    async removeStaff(actor, input) {
        try {
            const parsed = RemoveStaffSchema.parse(input);
            const eventResult = await this.getEvent(parsed.event_id);
            if (eventResult.error || !eventResult.data) {
                return { data: null, error: eventResult.error };
            }
            const event = eventResult.data;
            if (event.org_id !== actor.org_id) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'Cannot remove staff from external organization events.'),
                };
            }
            if (!(0, event_types_1.hasPermission)(actor, 'assign_event_staff') && !(0, event_types_1.hasRoleAtLeast)(actor, 'coordinator')) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to remove event staff.'),
                };
            }
            const { data: existing, error: existingError } = await this.supabase
                .from('event_staff')
                .select('*')
                .eq('event_id', parsed.event_id)
                .eq('user_id', parsed.user_id)
                .maybeSingle();
            if (existingError) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('STAFF_LOOKUP_FAILED', 'Failed to fetch event staff assignment.', existingError),
                };
            }
            if (!existing) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('STAFF_NOT_ASSIGNED', 'User is not assigned to this event.'),
                };
            }
            const { error } = await this.supabase
                .from('event_staff')
                .delete()
                .eq('event_id', parsed.event_id)
                .eq('user_id', parsed.user_id)
                .eq('org_id', actor.org_id);
            if (error) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('STAFF_REMOVE_FAILED', 'Failed to remove staff assignment.', error),
                };
            }
            await this.supabase.from('notifications').insert({
                org_id: actor.org_id,
                user_id: parsed.user_id,
                created_by_user_id: actor.id,
                type: 'event.staff_removed',
                title: 'Removed from event staff',
                message: 'You were removed from an event staff assignment.',
                data: {
                    event_id: parsed.event_id,
                },
                priority: 'normal',
            });
            await this.createSystemLog({
                org_id: actor.org_id,
                user_id: actor.id,
                action_type: 'staff_removed',
                entity_id: existing.id,
                payload: {
                    event_id: parsed.event_id,
                    user_id: parsed.user_id,
                },
            });
            return { data: true, error: null };
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('STAFF_REMOVE_VALIDATION_ERROR', 'Invalid staff removal payload.', error),
            };
        }
    }
}
exports.EventStaffService = EventStaffService;
