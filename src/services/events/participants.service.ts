import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventParticipantRow, EventRow, ParticipantStatus } from '../../models/events/types';
import type { EventActorContext, ParticipantApplyInput, ParticipantStatusUpdateInput, ServiceResult } from './event.types';
import { hasPermission, hasRoleAtLeast, toServiceError } from './event.types';

const ParticipantApplySchema = z
  .object({
    event_id: z.string().uuid(),
    participant_type: z.enum(['user', 'donor']),
    participant_user_id: z.string().uuid().optional().nullable(),
    participant_donor_id: z.string().uuid().optional().nullable(),
    notes: z.string().trim().optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.participant_type === 'user' && !val.participant_user_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'participant_user_id is required when participant_type is user.',
        path: ['participant_user_id'],
      });
    }

    if (val.participant_type === 'donor' && !val.participant_donor_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'participant_donor_id is required when participant_type is donor.',
        path: ['participant_donor_id'],
      });
    }
  });

const ParticipantStatusUpdateSchema = z.object({
  event_id: z.string().uuid(),
  participant_id: z.string().uuid(),
  status: z.enum(['applied', 'confirmed', 'participated', 'donated']),
  notes: z.string().trim().optional().nullable(),
});

const VALID_STATUS_FLOW: Record<ParticipantStatus, ParticipantStatus[]> = {
  applied: ['confirmed'],
  confirmed: ['participated'],
  participated: ['donated'],
  donated: [],
};

export class EventParticipantsService {
  constructor(private readonly supabase: SupabaseClient) {}

  private async getEvent(eventId: string): Promise<ServiceResult<EventRow>> {
    const { data, error } = await this.supabase.from('events').select('*').eq('id', eventId).single();

    if (error || !data) {
      return {
        data: null,
        error: toServiceError('EVENT_NOT_FOUND', 'Event was not found.', error),
      };
    }

    return { data: data as EventRow, error: null };
  }

  private async createSystemLog(params: {
    org_id: string;
    user_id: string;
    action_type: 'participant_joined' | 'participant_approved';
    entity_id: string;
    payload: Record<string, unknown>;
    status?: string;
  }): Promise<void> {
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

  private async notifyParticipant(params: {
    org_id: string;
    user_id?: string | null;
    actor_user_id: string;
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
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

  async applyToEvent(actor: EventActorContext, input: ParticipantApplyInput): Promise<ServiceResult<EventParticipantRow>> {
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
          error: toServiceError('PERMISSION_DENIED', 'This event is not open for your organization context.'),
        };
      }

      if (!['approved', 'pending', 'rescheduled'].includes(event.status)) {
        return {
          data: null,
          error: toServiceError('INVALID_EVENT_STATE', 'Cannot apply to this event in its current status.'),
        };
      }

      if (parsed.participant_type === 'user') {
        if (!isSameOrg && !isPublic) {
          return {
            data: null,
            error: toServiceError('PERMISSION_DENIED', 'User participant must belong to event organization unless event is public.'),
          };
        }

        if (parsed.participant_user_id !== actor.id && !hasRoleAtLeast(actor, 'coordinator')) {
          return {
            data: null,
            error: toServiceError('PERMISSION_DENIED', 'You can only apply yourself as a user participant.'),
          };
        }
      }

      const { data, error } = await this.supabase
        .from('event_participants')
        .upsert({
          org_id: event.org_id,
          event_id: event.id,
          participant_type: parsed.participant_type,
          participant_user_id: parsed.participant_type === 'user' ? parsed.participant_user_id ?? actor.id : null,
          participant_donor_id: parsed.participant_type === 'donor' ? parsed.participant_donor_id ?? null : null,
          status: 'applied',
          notes: parsed.notes ?? null,
        }, { onConflict: 'event_id,participant_type,coalesce(participant_user_id, participant_donor_id)' })
        .select('*')
        .single();

      if (error || !data) {
        return {
          data: null,
          error: toServiceError('PARTICIPANT_APPLY_FAILED', 'Failed to apply participant to event.', error),
        };
      }

      const participant = data as EventParticipantRow;

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
    } catch (error) {
      return {
        data: null,
        error: toServiceError('PARTICIPANT_APPLY_VALIDATION_ERROR', 'Invalid participant apply payload.', error),
      };
    }
  }

  async updateParticipantStatus(
    actor: EventActorContext,
    input: ParticipantStatusUpdateInput
  ): Promise<ServiceResult<EventParticipantRow>> {
    try {
      const parsed = ParticipantStatusUpdateSchema.parse(input);

      if (!hasPermission(actor, 'manage_event_participants') && !hasRoleAtLeast(actor, 'coordinator')) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You do not have permission to manage event participants.'),
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
          error: toServiceError('PERMISSION_DENIED', 'Cross-organization participant updates are not allowed.'),
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
          error: toServiceError('PARTICIPANT_NOT_FOUND', 'Participant record was not found.', participantError),
        };
      }

      const participant = participantData as EventParticipantRow;
      const allowedTargets = VALID_STATUS_FLOW[participant.status] ?? [];

      if (!allowedTargets.includes(parsed.status)) {
        return {
          data: null,
          error: toServiceError(
            'INVALID_PARTICIPANT_TRANSITION',
            `Invalid participant status transition: ${participant.status} -> ${parsed.status}.`
          ),
        };
      }

      const patch: Record<string, unknown> = {
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
          error: toServiceError('PARTICIPANT_UPDATE_FAILED', 'Failed to update participant status.', error),
        };
      }

      const updated = data as EventParticipantRow;

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
    } catch (error) {
      return {
        data: null,
        error: toServiceError('PARTICIPANT_UPDATE_VALIDATION_ERROR', 'Invalid participant update payload.', error),
      };
    }
  }
}
