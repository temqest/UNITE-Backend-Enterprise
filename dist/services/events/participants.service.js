"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventParticipantsService = void 0;
const zod_1 = require("zod");
const event_types_1 = require("./event.types");
const ParticipantApplySchema = zod_1.z
    .object({
    event_id: zod_1.z.string().uuid(),
    participant_type: zod_1.z.enum(['user', 'donor']),
    participant_user_id: zod_1.z.string().uuid().optional().nullable(),
    participant_donor_id: zod_1.z.string().uuid().optional().nullable(),
    notes: zod_1.z.string().trim().optional().nullable(),
})
    .superRefine((val, ctx) => {
    if (val.participant_type === 'user' && !val.participant_user_id) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'participant_user_id is required when participant_type is user.',
            path: ['participant_user_id'],
        });
    }
    if (val.participant_type === 'donor' && !val.participant_donor_id) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'participant_donor_id is required when participant_type is donor.',
            path: ['participant_donor_id'],
        });
    }
});
const ParticipantStatusUpdateSchema = zod_1.z.object({
    event_id: zod_1.z.string().uuid(),
    participant_id: zod_1.z.string().uuid(),
    status: zod_1.z.enum(['applied', 'confirmed', 'participated', 'donated', 'no_show']),
    notes: zod_1.z.string().trim().optional().nullable(),
});
const VALID_STATUS_FLOW = {
    applied: ['confirmed', 'participated', 'no_show'],
    confirmed: ['participated', 'no_show'],
    participated: ['donated', 'no_show'],
    donated: ['participated', 'no_show'],
    no_show: ['confirmed', 'participated'],
};
class EventParticipantsService {
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
    async createSystemLog(params) {
        await this.supabase.from('system_logs').insert({
            org_id: params.org_id,
            user_id: params.user_id,
            category: 'participants',
            action_type: params.action_type,
            entity_type: 'event_participant',
            entity_id: params.entity_id,
            payload: params.payload,
            status: params.status ?? null,
        });
    }
    async notifyParticipant(params) {
        await this.supabase.from('notifications').insert({
            org_id: params.org_id,
            user_id: params.user_id ?? null,
            created_by_user_id: params.actor_user_id,
            type: params.type,
            title: params.title,
            message: params.message,
            data: params.data ?? {},
            priority: 'normal',
        });
    }
    async applyToEvent(actor, input) {
        try {
            const parsed = ParticipantApplySchema.parse(input);
            const eventResult = await this.getEvent(parsed.event_id);
            if (eventResult.error || !eventResult.data) {
                return { data: null, error: eventResult.error };
            }
            const event = eventResult.data;
            const isSameOrg = event.org_id === actor.org_id;
            const isPublic = event.is_public;
            if (!isSameOrg && !isPublic) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'This event is not open for your organization context.'),
                };
            }
            if (!['scheduled', 'published', 'ongoing'].includes(event.status)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('INVALID_EVENT_STATE', 'Cannot apply to this event in its current status.'),
                };
            }
            if (parsed.participant_type === 'user') {
                if (!isSameOrg && !isPublic) {
                    return {
                        data: null,
                        error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'User participant must belong to event organization unless event is public.'),
                    };
                }
                if (parsed.participant_user_id !== actor.id && !(0, event_types_1.hasRoleAtLeast)(actor, 'coordinator')) {
                    return {
                        data: null,
                        error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You can only apply yourself as a user participant.'),
                    };
                }
            }
            const participantUserId = parsed.participant_type === 'user' ? parsed.participant_user_id ?? actor.id : null;
            const participantDonorId = parsed.participant_type === 'donor' ? parsed.participant_donor_id ?? null : null;
            let checkQuery = this.supabase
                .from('event_participants')
                .select('*')
                .eq('event_id', event.id)
                .eq('participant_type', parsed.participant_type);
            if (participantUserId) {
                checkQuery = checkQuery.eq('participant_user_id', participantUserId);
            }
            else {
                checkQuery = checkQuery.is('participant_user_id', null);
            }
            if (participantDonorId) {
                checkQuery = checkQuery.eq('participant_donor_id', participantDonorId);
            }
            else {
                checkQuery = checkQuery.is('participant_donor_id', null);
            }
            const { data: existingData } = await checkQuery.maybeSingle();
            let data, error;
            if (existingData) {
                if (['donated', 'participated', 'attended', 'completed'].includes(existingData.status)) {
                    return { data: existingData, error: null };
                }
                const nextStatus = existingData.status === 'approved' ? 'approved' : 'applied';
                const res = await this.supabase
                    .from('event_participants')
                    .update({
                    status: nextStatus,
                    notes: parsed.notes ?? existingData.notes ?? null,
                })
                    .eq('id', existingData.id)
                    .select('*')
                    .single();
                data = res.data;
                error = res.error;
            }
            else {
                const res = await this.supabase
                    .from('event_participants')
                    .insert({
                    org_id: event.org_id,
                    event_id: event.id,
                    participant_type: parsed.participant_type,
                    participant_user_id: participantUserId,
                    participant_donor_id: participantDonorId,
                    status: 'applied',
                    notes: parsed.notes ?? null,
                })
                    .select('*')
                    .single();
                data = res.data;
                error = res.error;
            }
            if (error || !data) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PARTICIPANT_APPLY_FAILED', 'Failed to apply participant to event.', error),
                };
            }
            const participant = data;
            await this.createSystemLog({
                org_id: event.org_id,
                user_id: actor.id,
                action_type: 'participant_joined',
                entity_id: participant.id,
                payload: {
                    event_id: event.id,
                    participant_type: participant.participant_type,
                    participant_user_id: participant.participant_user_id,
                    participant_donor_id: participant.participant_donor_id,
                },
                status: participant.status,
            });
            if (participant.participant_user_id) {
                await this.notifyParticipant({
                    org_id: event.org_id,
                    user_id: participant.participant_user_id,
                    actor_user_id: actor.id,
                    type: 'event.participant_applied',
                    title: 'Event application submitted',
                    message: `Your application for ${event.title} was submitted.`,
                    data: {
                        event_id: event.id,
                        participant_id: participant.id,
                    },
                });
            }
            return { data: participant, error: null };
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PARTICIPANT_APPLY_VALIDATION_ERROR', 'Invalid participant apply payload.', error),
            };
        }
    }
    async updateParticipantStatus(actor, input) {
        try {
            const parsed = ParticipantStatusUpdateSchema.parse(input);
            if (!(0, event_types_1.hasPermission)(actor, 'manage_event_participants') && !(0, event_types_1.hasRoleAtLeast)(actor, 'coordinator')) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'You do not have permission to manage event participants.'),
                };
            }
            const eventResult = await this.getEvent(parsed.event_id);
            if (eventResult.error || !eventResult.data) {
                return { data: null, error: eventResult.error };
            }
            const event = eventResult.data;
            if (event.org_id !== actor.org_id) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PERMISSION_DENIED', 'Cross-organization participant updates are not allowed.'),
                };
            }
            const { data: participantData, error: participantError } = await this.supabase
                .from('event_participants')
                .select('*')
                .eq('id', parsed.participant_id)
                .eq('event_id', parsed.event_id)
                .single();
            if (participantError || !participantData) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PARTICIPANT_NOT_FOUND', 'Participant record was not found.', participantError),
                };
            }
            const participant = participantData;
            const allowedTargets = VALID_STATUS_FLOW[participant.status] ?? [];
            if (!allowedTargets.includes(parsed.status)) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('INVALID_PARTICIPANT_TRANSITION', `Invalid participant status transition: ${participant.status} -> ${parsed.status}.`),
                };
            }
            const patch = {
                status: parsed.status,
                notes: parsed.notes ?? participant.notes,
            };
            if (parsed.status === 'confirmed') {
                patch.confirmed_at = new Date().toISOString();
            }
            if (parsed.status === 'participated') {
                patch.participated_at = new Date().toISOString();
            }
            if (parsed.status === 'donated') {
                patch.donated_at = new Date().toISOString();
            }
            const { data, error } = await this.supabase
                .from('event_participants')
                .update(patch)
                .eq('id', participant.id)
                .eq('org_id', actor.org_id)
                .select('*')
                .single();
            if (error || !data) {
                return {
                    data: null,
                    error: (0, event_types_1.toServiceError)('PARTICIPANT_UPDATE_FAILED', 'Failed to update participant status.', error),
                };
            }
            const updated = data;
            await this.createSystemLog({
                org_id: actor.org_id,
                user_id: actor.id,
                action_type: 'participant_approved',
                entity_id: updated.id,
                payload: {
                    event_id: event.id,
                    before_status: participant.status,
                    after_status: updated.status,
                },
                status: updated.status,
            });
            if (updated.participant_user_id) {
                await this.notifyParticipant({
                    org_id: actor.org_id,
                    user_id: updated.participant_user_id,
                    actor_user_id: actor.id,
                    type: 'event.participant_status_changed',
                    title: 'Participant status updated',
                    message: `Your status for ${event.title} is now ${updated.status}.`,
                    data: {
                        event_id: event.id,
                        participant_id: updated.id,
                        status: updated.status,
                    },
                });
            }
            return { data: updated, error: null };
        }
        catch (error) {
            return {
                data: null,
                error: (0, event_types_1.toServiceError)('PARTICIPANT_UPDATE_VALIDATION_ERROR', 'Invalid participant update payload.', error),
            };
        }
    }
}
exports.EventParticipantsService = EventParticipantsService;
