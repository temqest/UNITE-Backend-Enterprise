import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventParticipantRow, EventRow, EventStaffRow, EventStatus, EventType, ParticipantStatus } from '../../models/events/types';
import type { EventActorContext, ServiceResult } from './event.types';
import { EventService } from './event.service';
import { hasPermission, hasRoleAtLeast, toServiceError } from './event.types';

export interface MyEventsFilter {
  statuses?: EventStatus[];
  types?: EventType[];
  from_date?: string;
  to_date?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface EventSummaryStats {
  target_bags: number;
  actual_collected_bags: number;
  actual_donors: number;
  applicants_count: number;
  donated_count: number;
  no_show_count: number;
  staff_assigned_count: number;
  completion_rate: number;
}

export interface MyEventRecord {
  event: EventRow;
  stats: EventSummaryStats;
}

export interface EventParticipantView extends EventParticipantRow {
  participant_name: string | null;
  participant_first_name: string | null;
  participant_last_name: string | null;
  participant_email: string | null;
}

export interface EventStaffView extends EventStaffRow {
  staff_name: string;
  staff_email: string;
}

export interface EventStatsResponse {
  event: EventRow;
  stats: EventSummaryStats;
  participants: EventParticipantView[];
  staff: EventStaffView[];
}

const FilterSchema = z.object({
  statuses: z.array(z.enum(['draft', 'plotted', 'needs_details', 'scheduled', 'published', 'ongoing', 'completed', 'cancelled'])).optional(),
  types: z.array(z.enum(['blood_drive', 'training', 'advocacy', 'assembly'])).optional(),
  from_date: z.string().date().optional(),
  to_date: z.string().date().optional(),
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

const ResultsUpdateSchema = z.object({
  actual_collected_bags: z.number().int().min(0),
  actual_donors: z.number().int().min(0),
  wastage_units: z.number().int().min(0).optional(),
  post_event_notes: z.string().trim().optional(),
  post_event_attachments: z.array(z.string().url()).optional(),
  mark_as_completed: z.boolean().optional(),
});

function getTargetDonation(extraData: unknown): number {
  if (!extraData || typeof extraData !== 'object' || Array.isArray(extraData)) {
    return 0;
  }

  const targetRaw = (extraData as Record<string, unknown>).target_donation;
  if (typeof targetRaw === 'number' && Number.isFinite(targetRaw)) {
    return Math.max(0, Math.round(targetRaw));
  }

  if (typeof targetRaw === 'string') {
    const parsed = Number(targetRaw);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.round(parsed));
    }
  }

  return 0;
}

export class EventOperationsService {
  private readonly eventService: EventService;

  constructor(private readonly supabase: SupabaseClient) {
    this.eventService = new EventService(supabase);
  }

  private canManageResults(actor: EventActorContext, event: EventRow, isAssignedStaff: boolean): boolean {
    if (hasRoleAtLeast(actor, 'coordinator')) {
      return true;
    }

    if (hasPermission(actor, 'events.update') || hasPermission(actor, 'manage_events') || hasPermission(actor, 'edit_events')) {
      return true;
    }

    if (event.requested_by_user_id === actor.id) {
      return true;
    }

    return isAssignedStaff;
  }

  private async getActorEventMembership(actor: EventActorContext): Promise<ServiceResult<Set<string>>> {
    const eventIds = new Set<string>();

    const { data: staffRows, error: staffError } = await this.supabase
      .from('event_staff')
      .select('event_id')
      .eq('org_id', actor.org_id)
      .eq('user_id', actor.id);

    if (staffError) {
      return {
        data: null,
        error: toServiceError('EVENT_STAFF_MEMBERSHIP_LOOKUP_FAILED', 'Failed to lookup staff event memberships.', staffError),
      };
    }

    for (const row of (staffRows ?? []) as Array<{ event_id: string }>) {
      if (row.event_id) {
        eventIds.add(row.event_id);
      }
    }

    const { data: participantRows, error: participantError } = await this.supabase
      .from('event_participants')
      .select('event_id')
      .eq('org_id', actor.org_id)
      .eq('participant_type', 'user')
      .eq('participant_user_id', actor.id);

    if (participantError) {
      return {
        data: null,
        error: toServiceError('EVENT_PARTICIPANT_MEMBERSHIP_LOOKUP_FAILED', 'Failed to lookup participant event memberships.', participantError),
      };
    }

    for (const row of (participantRows ?? []) as Array<{ event_id: string }>) {
      if (row.event_id) {
        eventIds.add(row.event_id);
      }
    }

    return { data: eventIds, error: null };
  }

  private async getCountsByEventId(eventIds: string[]): Promise<ServiceResult<Map<string, EventSummaryStats>>> {
    const statsMap = new Map<string, EventSummaryStats>();
    for (const eventId of eventIds) {
      statsMap.set(eventId, {
        target_bags: 0,
        actual_collected_bags: 0,
        actual_donors: 0,
        applicants_count: 0,
        donated_count: 0,
        no_show_count: 0,
        staff_assigned_count: 0,
        completion_rate: 0,
      });
    }

    if (eventIds.length === 0) {
      return { data: statsMap, error: null };
    }

    const [participantsResult, staffResult] = await Promise.all([
      this.supabase
        .from('event_participants')
        .select('event_id, status')
        .in('event_id', eventIds),
      this.supabase
        .from('event_staff')
        .select('event_id')
        .in('event_id', eventIds),
    ]);

    if (participantsResult.error) {
      return {
        data: null,
        error: toServiceError('EVENT_PARTICIPANT_STATS_LOOKUP_FAILED', 'Failed to fetch participant stats.', participantsResult.error),
      };
    }

    if (staffResult.error) {
      return {
        data: null,
        error: toServiceError('EVENT_STAFF_STATS_LOOKUP_FAILED', 'Failed to fetch staff stats.', staffResult.error),
      };
    }

    for (const row of (participantsResult.data ?? []) as Array<{ event_id: string; status: ParticipantStatus }>) {
      const entry = statsMap.get(row.event_id);
      if (!entry) {
        continue;
      }

      entry.applicants_count += 1;
      if (row.status === 'donated') {
        entry.donated_count += 1;
      }
      if (row.status === 'no_show') {
        entry.no_show_count += 1;
      }
    }

    for (const row of (staffResult.data ?? []) as Array<{ event_id: string }>) {
      const entry = statsMap.get(row.event_id);
      if (!entry) {
        continue;
      }
      entry.staff_assigned_count += 1;
    }

    return { data: statsMap, error: null };
  }

  async listMyEvents(actor: EventActorContext, filter: MyEventsFilter = {}): Promise<ServiceResult<MyEventRecord[]>> {
    try {
      const parsed = FilterSchema.parse(filter);
      const limit = parsed.limit ?? 50;
      const offset = parsed.offset ?? 0;
      const isAdminScope = hasRoleAtLeast(actor, 'admin');
      let membership: Set<string> | null = null;

      if (!isAdminScope) {
        const membershipResult = await this.getActorEventMembership(actor);
        if (membershipResult.error || !membershipResult.data) {
          return { data: null, error: membershipResult.error };
        }
        membership = membershipResult.data;
      }

      let query = this.supabase
        .from('events')
        .select('*')
        .eq('org_id', actor.org_id)
        .order('event_date', { ascending: false })
        .order('start_time', { ascending: false });

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

      if (parsed.search) {
        const search = parsed.search.replace(/[%,()]/g, ' ').trim();
        if (search.length > 0) {
          query = query.or(`title.ilike.%${search}%,address.ilike.%${search}%,description.ilike.%${search}%`);
        }
      }

      if (!isAdminScope) {
        const membershipIds = Array.from(membership ?? []);
        const visibility = [`requested_by_user_id.eq.${actor.id}`];
        if (membershipIds.length > 0) {
          visibility.push(`id.in.(${membershipIds.join(',')})`);
        }
        query = query.or(visibility.join(','));
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) {
        return {
          data: null,
          error: toServiceError('MY_EVENTS_LIST_FAILED', 'Failed to fetch my events.', error),
        };
      }

      const paged = ((data ?? []) as EventRow[]);
      const eventIds = paged.map((event) => event.id);
      const countResult = await this.getCountsByEventId(eventIds);
      if (countResult.error || !countResult.data) {
        return { data: null, error: countResult.error };
      }

      const enriched = paged.map((event) => {
        const stats = countResult.data?.get(event.id);
        const targetBags = getTargetDonation(event.extra_data);
        const actualCollected = event.actual_collected_bags ?? 0;
        const actualDonors = event.actual_donors ?? stats?.donated_count ?? 0;
        const completionRate = targetBags > 0 ? Math.round((actualCollected / targetBags) * 100) : 0;

        return {
          event,
          stats: {
            target_bags: targetBags,
            actual_collected_bags: actualCollected,
            actual_donors: actualDonors,
            applicants_count: stats?.applicants_count ?? 0,
            donated_count: stats?.donated_count ?? 0,
            no_show_count: stats?.no_show_count ?? 0,
            staff_assigned_count: stats?.staff_assigned_count ?? 0,
            completion_rate: completionRate,
          },
        };
      });

      return { data: enriched, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError('MY_EVENTS_FILTER_INVALID', 'Invalid my-events filter.', error),
      };
    }
  }

  async getEventStats(actor: EventActorContext, eventId: string): Promise<ServiceResult<EventStatsResponse>> {
    const eventResult = await this.eventService.getEventById(eventId, actor);
    if (eventResult.error || !eventResult.data) {
      return { data: null, error: eventResult.error };
    }

    const event = eventResult.data;

    const [participantsResult, staffResult] = await Promise.all([
      this.supabase
        .from('event_participants')
        .select('*')
        .eq('event_id', eventId)
        .eq('org_id', actor.org_id),
      this.supabase
        .from('event_staff')
        .select('*')
        .eq('event_id', eventId)
        .eq('org_id', actor.org_id),
    ]);

    if (participantsResult.error) {
      return {
        data: null,
        error: toServiceError('EVENT_PARTICIPANTS_LOOKUP_FAILED', 'Failed to load event participants.', participantsResult.error),
      };
    }

    if (staffResult.error) {
      return {
        data: null,
        error: toServiceError('EVENT_STAFF_LOOKUP_FAILED', 'Failed to load event staff.', staffResult.error),
      };
    }

    const participants = (participantsResult.data ?? []) as EventParticipantRow[];
    const staff = (staffResult.data ?? []) as EventStaffRow[];

    const participantUserIds = Array.from(new Set(
      participants
        .map((participant) => participant.participant_user_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ));

    const participantDonorIds = Array.from(new Set(
      participants
        .map((participant) => participant.participant_donor_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ));

    const staffUserIds = Array.from(new Set(staff.map((entry) => entry.user_id)));
    const allUserIds = Array.from(new Set([...participantUserIds, ...participantDonorIds, ...staffUserIds]));

    let userMap = new Map<string, { first_name: string; last_name: string; full_name: string; email: string }>();
    if (allUserIds.length > 0) {
      const { data: usersData, error: usersError } = await this.supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .in('id', allUserIds);

      if (usersError) {
        return {
          data: null,
          error: toServiceError('EVENT_USER_LOOKUP_FAILED', 'Failed to load event user details.', usersError),
        };
      }

      for (const row of (usersData ?? []) as Array<{ id: string; first_name: string; last_name: string; email: string }>) {
        const first = String(row.first_name ?? '').trim();
        const last = String(row.last_name ?? '').trim();
        const fullName = [first, last].filter(Boolean).join(' ').trim() || row.email;
        userMap.set(row.id, {
          first_name: first,
          last_name: last,
          full_name: fullName,
          email: row.email,
        });
      }
    }

    const applicants = participants.length;
    const donated = participants.filter((participant) => participant.status === 'donated').length;
    const noShow = participants.filter((participant) => participant.status === 'no_show').length;
    const targetBags = getTargetDonation(event.extra_data);
    const actualCollected = event.actual_collected_bags ?? 0;

    const response: EventStatsResponse = {
      event,
      stats: {
        target_bags: targetBags,
        actual_collected_bags: actualCollected,
        actual_donors: event.actual_donors ?? donated,
        applicants_count: applicants,
        donated_count: donated,
        no_show_count: noShow,
        staff_assigned_count: staff.length,
        completion_rate: targetBags > 0 ? Math.round((actualCollected / targetBags) * 100) : 0,
      },
      participants: participants.map((participant) => ({
        ...participant,
        participant_name: participant.participant_user_id
          ? userMap.get(participant.participant_user_id)?.full_name ?? null
          : participant.participant_donor_id
            ? userMap.get(participant.participant_donor_id)?.full_name ?? null
            : null,
        participant_first_name: participant.participant_user_id
          ? userMap.get(participant.participant_user_id)?.first_name ?? null
          : participant.participant_donor_id
            ? userMap.get(participant.participant_donor_id)?.first_name ?? null
            : null,
        participant_last_name: participant.participant_user_id
          ? userMap.get(participant.participant_user_id)?.last_name ?? null
          : participant.participant_donor_id
            ? userMap.get(participant.participant_donor_id)?.last_name ?? null
            : null,
        participant_email: participant.participant_user_id
          ? userMap.get(participant.participant_user_id)?.email ?? null
          : participant.participant_donor_id
            ? userMap.get(participant.participant_donor_id)?.email ?? null
            : null,
      })),
      staff: staff.map((entry) => ({
        ...entry,
        staff_name: userMap.get(entry.user_id)?.full_name ?? 'Unknown staff',
        staff_email: userMap.get(entry.user_id)?.email ?? '',
      })),
    };

    return { data: response, error: null };
  }

  async updateEventResults(
    actor: EventActorContext,
    eventId: string,
    input: unknown
  ): Promise<ServiceResult<EventStatsResponse>> {
    try {
      const parsed = ResultsUpdateSchema.parse(input);
      const eventResult = await this.eventService.getEventById(eventId, actor);
      if (eventResult.error || !eventResult.data) {
        return { data: null, error: eventResult.error };
      }

      const event = eventResult.data;
      if (event.org_id !== actor.org_id) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'Cannot update results for events from another organization.'),
        };
      }

      const { data: staffMembership, error: staffMembershipError } = await this.supabase
        .from('event_staff')
        .select('id')
        .eq('event_id', eventId)
        .eq('org_id', actor.org_id)
        .eq('user_id', actor.id)
        .maybeSingle();

      if (staffMembershipError) {
        return {
          data: null,
          error: toServiceError('EVENT_STAFF_MEMBERSHIP_LOOKUP_FAILED', 'Failed to verify event staff membership.', staffMembershipError),
        };
      }

      if (!this.canManageResults(actor, event, Boolean(staffMembership))) {
        return {
          data: null,
          error: toServiceError('PERMISSION_DENIED', 'You do not have permission to update event results.'),
        };
      }

      if (event.type !== 'blood_drive') {
        return {
          data: null,
          error: toServiceError(
            'EVENT_RESULTS_NOT_SUPPORTED',
            'Post-event donation and inventory updates are only supported for blood drive events.'
          ),
        };
      }

      const shouldMarkCompleted = parsed.mark_as_completed !== false;

      const extraDataSource =
        event.extra_data && typeof event.extra_data === 'object' && !Array.isArray(event.extra_data)
          ? (event.extra_data as Record<string, unknown>)
          : {};

      const nextExtraData: Record<string, unknown> = {
        ...extraDataSource,
      };
      if (event.type === 'blood_drive') {
        nextExtraData.collected_blood = parsed.actual_collected_bags;
      }

      const patch: Record<string, unknown> = {
        actual_collected_bags: parsed.actual_collected_bags,
        actual_donors: parsed.actual_donors,
        wastage_units: parsed.wastage_units ?? 0,
        post_event_notes: parsed.post_event_notes ?? null,
        post_event_attachments: parsed.post_event_attachments ?? event.post_event_attachments ?? [],
        extra_data: nextExtraData,
      };

      if (shouldMarkCompleted) {
        patch.status = 'completed';
        patch.completed_at = new Date().toISOString();
      }

      const eventsTable = this.supabase.from('events') as any;
      const { data: updatedData, error: updateError } = await eventsTable
        .update(patch)
        .eq('id', eventId)
        .eq('org_id', actor.org_id)
        .select('*')
        .single();

      if (updateError || !updatedData) {
        return {
          data: null,
          error: toServiceError('EVENT_RESULTS_UPDATE_FAILED', 'Failed to update event post-event results.', updateError),
        };
      }

      const updatedEvent = updatedData as EventRow;

      await this.supabase.from('system_logs').insert({
        org_id: actor.org_id,
        user_id: actor.id,
        category: 'events',
        action_type: 'event_updated',
        entity_type: 'event',
        entity_id: eventId,
        payload: {
          before_status: event.status,
          after_status: updatedEvent.status,
          actual_collected_bags: updatedEvent.actual_collected_bags,
          actual_donors: updatedEvent.actual_donors,
          wastage_units: updatedEvent.wastage_units,
        },
        notes: parsed.post_event_notes ?? null,
        status: updatedEvent.status,
      });

      await this.supabase.from('system_logs').insert({
        org_id: actor.org_id,
        user_id: actor.id,
        category: 'inventory',
        action_type: 'inventory_added',
        entity_type: 'event',
        entity_id: eventId,
        payload: {
          source: 'event_results',
          event_id: eventId,
          collected_units: updatedEvent.actual_collected_bags ?? 0,
          wastage_units: updatedEvent.wastage_units ?? 0,
          net_units: (updatedEvent.actual_collected_bags ?? 0) - (updatedEvent.wastage_units ?? 0),
        },
        status: 'completed',
      });

      await this.supabase.from('notifications').insert({
        org_id: actor.org_id,
        user_id: null,
        created_by_user_id: actor.id,
        type: 'event.completed',
        title: 'Event results updated',
        message: `${updatedEvent.title} was updated with post-event results.`,
        data: {
          event_id: updatedEvent.id,
          status: updatedEvent.status,
          actual_collected_bags: updatedEvent.actual_collected_bags,
          actual_donors: updatedEvent.actual_donors,
        },
        priority: 'normal',
      });

      return this.getEventStats(actor, eventId);
    } catch (error) {
      return {
        data: null,
        error: toServiceError('EVENT_RESULTS_VALIDATION_ERROR', 'Invalid post-event update payload.', error),
      };
    }
  }
}
