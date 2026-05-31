import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventActionAvailability, EventActorContext, ServiceResult } from './event.types';
import { EventService } from './event.service';

export class EventActionsService {
  private readonly eventService: EventService;

  constructor(private readonly supabase: SupabaseClient) {
    this.eventService = new EventService(supabase);
  }

  async getAvailableActions(actor: EventActorContext, eventId: string): Promise<ServiceResult<EventActionAvailability>> {
    const eventResult = await this.eventService.getEventById(eventId, actor);
    if (eventResult.error || !eventResult.data) {
      return { data: null, error: eventResult.error };
    }

    const event = eventResult.data;
    const sameOrg = event.org_id === actor.org_id;
    const canEdit = sameOrg && (event.requested_by_user_id === actor.id || actor.role.type === 'admin' || actor.role.type === 'coordinator');
    const canPublish = sameOrg && (actor.role.type === 'admin' || actor.role.type === 'coordinator');

    const actions: EventActionAvailability['actions'] = ['view_private'];

    if (canEdit) {
      actions.push('edit_event', 'complete_event_setup', 'change_event_status');
    }

    if (canPublish && event.status !== 'published') {
      actions.push('publish_event');
    }

    if (canPublish && !['completed', 'cancelled'].includes(event.status)) {
      actions.push('cancel_event');
    }

    return {
      data: {
        event_id: event.id,
        status: event.status,
        actions,
      },
      error: null,
    };
  }
}
