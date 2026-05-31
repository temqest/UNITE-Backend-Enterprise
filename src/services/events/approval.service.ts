import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventRow } from '../../models/events/types';
import type { ApprovalActionInput, EventActorContext, ReviewerCandidate, ServiceResult } from './event.types';
import { toServiceError } from './event.types';

export class EventApprovalService {
  constructor(private readonly supabase: SupabaseClient) {
    void this.supabase;
  }

  async getReviewersForEvent(_eventId: string): Promise<ServiceResult<ReviewerCandidate[]>> {
    return { data: [], error: null };
  }

  async requestApproval(
    _actor: EventActorContext,
    _eventId: string,
    _notes?: string | null
  ): Promise<ServiceResult<EventRow>> {
    return {
      data: null,
      error: toServiceError(
        'EVENT_WORKFLOW_DEPRECATED',
        'The request/approve event workflow has been deprecated. Use complete details, publish, or status updates instead.'
      ),
    };
  }

  async reviewApproval(_actor: EventActorContext, _input: ApprovalActionInput): Promise<ServiceResult<EventRow>> {
    return {
      data: null,
      error: toServiceError(
        'EVENT_WORKFLOW_DEPRECATED',
        'The request/approve event workflow has been deprecated. Use complete details, publish, or status updates instead.'
      ),
    };
  }
}
