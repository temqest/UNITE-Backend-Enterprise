import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventRow, EventStatus } from '../../models/events/types';
import type { OrganizationSettingsRow } from '../../models/organization_settings/types';
import type { ServiceResult } from './event.types';
import { toServiceError } from './event.types';

export class EventValidationService {
  constructor(private readonly supabase: SupabaseClient) {}

  public async getOrganizationSettings(orgId: string): Promise<ServiceResult<OrganizationSettingsRow | null>> {
    const { data, error } = await this.supabase
      .from('organization_settings')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) {
      return {
        data: null,
        error: toServiceError('ORG_SETTINGS_LOOKUP_FAILED', 'Failed to fetch organization settings.', error),
      };
    }

    return { data: (data as OrganizationSettingsRow | null) ?? null, error: null };
  }

  private parseTimeToMinutes(timeValue: string): number {
    const [hours, minutes] = timeValue.split(':');
    return Number(hours) * 60 + Number(minutes);
  }

  public async validateCreationAgainstSettings(
    payload: { org_id: string; event_date: string; start_time: string; end_time: string; exclude_event_id?: string; creation_method?: string },
    settings: OrganizationSettingsRow | null
  ): Promise<ServiceResult<true>> {
    if (!settings) {
      return { data: true, error: null };
    }

    const today = new Date();
    const todayMidnightUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const [evYear, evMonth, evDay] = payload.event_date.split('-').map(Number);
    const eventMidnightUtc = Date.UTC(evYear, evMonth - 1, evDay);
    const daysDiff = Math.round((eventMidnightUtc - todayMidnightUtc) / (1000 * 60 * 60 * 24));
    const eventDate = new Date(eventMidnightUtc);

    if (daysDiff < settings.event_request_advance_days) {
      return {
        data: null,
        error: toServiceError(
          'ADVANCE_DAYS_VIOLATION',
          `Event must be created at least ${settings.event_request_advance_days} days in advance.`
        ),
      };
    }

    const dayOfWeek = eventDate.getUTCDay();
    const bannedDays = settings.banned_days_of_week ?? [];
    if (bannedDays.includes(dayOfWeek)) {
      return {
        data: null,
        error: toServiceError('BANNED_DAY_VIOLATION', 'Selected event day is not allowed by organization settings.'),
      };
    }

    const bannedDates = new Set((settings.banned_specific_dates ?? []).map((value) => value.trim()));
    if (bannedDates.has(payload.event_date)) {
      return {
        data: null,
        error: toServiceError('BANNED_DATE_VIOLATION', 'Selected event date is blocked by organization settings.'),
      };
    }

    if (!settings.allow_weekend_events && (dayOfWeek === 0 || dayOfWeek === 6)) {
      return {
        data: null,
        error: toServiceError('WEEKEND_NOT_ALLOWED', 'Weekend events are not allowed for this organization.'),
      };
    }

    const activeStatuses: EventStatus[] = ['plotted', 'needs_details', 'scheduled', 'published', 'ongoing'];
    const { data: sameDayEvents, error: sameDayError } = await this.supabase
      .from('events')
      .select('id, start_time, end_time')
      .eq('org_id', payload.org_id)
      .eq('event_date', payload.event_date)
      .in('status', activeStatuses);

    if (sameDayError) {
      return {
        data: null,
        error: toServiceError('EVENT_COUNT_LOOKUP_FAILED', 'Failed to validate organization event limits.', sameDayError),
      };
    }

    const filteredSameDayEvents = ((sameDayEvents ?? []) as Array<{ id: string; start_time: string | null; end_time: string | null }>)
      .filter((event) => event.id !== payload.exclude_event_id);

    if (payload.creation_method !== 'plotting_calendar') {
      if (filteredSameDayEvents.length >= settings.max_events_per_day) {
        return {
          data: null,
          error: toServiceError('MAX_EVENTS_PER_DAY_EXCEEDED', 'Maximum events per day has been reached.'),
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
            error: toServiceError('DOUBLE_BOOKING_NOT_ALLOWED', 'Event time conflicts with an existing event.'),
          };
        }
      }
    }

    return { data: true, error: null };
  }

  public async validateEventWindow(
    event: Pick<EventRow, 'org_id' | 'event_date' | 'start_time' | 'end_time' | 'id' | 'creation_method'>
  ): Promise<ServiceResult<true>> {
    if (!event.start_time || !event.end_time) {
      return { data: true, error: null };
    }

    const settingsResult = await this.getOrganizationSettings(event.org_id);
    if (settingsResult.error) {
      return { data: null, error: settingsResult.error };
    }

    return this.validateCreationAgainstSettings(
      {
        org_id: event.org_id,
        event_date: event.event_date,
        start_time: event.start_time,
        end_time: event.end_time,
        exclude_event_id: event.id,
        creation_method: event.creation_method,
      },
      settingsResult.data
    );
  }

  public async validatePublishReadiness(event: EventRow): Promise<ServiceResult<true>> {
    const missing: string[] = [];

    if (!event.title?.trim()) missing.push('Event title');
    if (!event.type) missing.push('Event type');
    if (!event.event_date) missing.push('Event date');
    if (!event.hosting_organization?.trim()) missing.push('Hosting organization');
    if (!event.coverage_area_boundary_id && !event.coverage_area_municipality) {
      missing.push('Event Area (City / Municipality)');
    }

    if (missing.length > 0) {
      return {
        data: null,
        error: toServiceError(
          'EVENT_SETUP_INCOMPLETE',
          'Please complete the required fields before publishing.',
          { missing }
        ),
      };
    }

    return { data: true, error: null };
  }
}
