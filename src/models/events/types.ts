// events/types.ts
export type EventType = 'blood_drive' | 'training' | 'advocacy' | 'assembly';
export type EventStatus =
  | 'draft'
  | 'plotted'
  | 'needs_details'
  | 'scheduled'
  | 'published'
  | 'ongoing'
  | 'completed'
  | 'cancelled';
export type EventSetupStatus = 'needs_details' | 'pending_setup' | 'complete';
export type EventCreationMethod = 'manual' | 'plotting_calendar';
export type EventVisibility = 'internal' | 'public';

export type ParticipantType = 'user' | 'donor';
export type ParticipantStatus = 'applied' | 'confirmed' | 'participated' | 'donated' | 'no_show';

export type EventApprovalAction = 'request' | 'accept' | 'reject' | 'reschedule' | 'auto_approve';

export interface BloodDriveExtraData {
  target_donation?: number;
  collected_blood?: number;
}

export interface TrainingExtraData {
  training_type: string;
}

export interface AdvocacyExtraData {
  topic: string;
}

export interface AssemblyExtraData {
  agenda?: string;
}

export type EventExtraData =
  (BloodDriveExtraData | TrainingExtraData | AdvocacyExtraData | AssemblyExtraData)
  & Record<string, unknown>;

export interface EventRequesterSummary {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
}

export interface EventLatestApprovalSummary {
  action: EventApprovalAction;
  acted_by_user_id: string | null;
  to_status: EventStatus;
  notes: string | null;
  created_at: string;
}

export interface EventRow {
  id: string;
  org_id: string;
  title: string;
  address: string | null;
  type: EventType;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  image_url: string | null;
  extra_data: EventExtraData;
  status: EventStatus;
  setup_status: EventSetupStatus;
  setup_completed_at: string | null;
  creation_method: EventCreationMethod;
  plotting_calendar_id: string | null;
  hosting_organization: string | null;
  visibility: EventVisibility;
  requested_by_user_id: string | null;
  requested_by?: EventRequesterSummary | null;
  latest_approval?: EventLatestApprovalSummary | null;
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  rescheduled_at: string | null;
  completed_at: string | null;
  actual_collected_bags: number | null;
  actual_donors: number | null;
  wastage_units: number | null;
  post_event_notes: string | null;
  post_event_attachments: string[];
  is_public: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventCreateInput {
  org_id: string;
  title: string;
  address?: string | null;
  type: EventType;
  event_date: string;
  start_time?: string | null;
  end_time?: string | null;
  description?: string | null;
  image_url?: string | null;
  extra_data: EventExtraData;
  status?: EventStatus;
  setup_status?: EventSetupStatus;
  setup_completed_at?: string | null;
  creation_method?: EventCreationMethod;
  plotting_calendar_id?: string | null;
  hosting_organization?: string | null;
  visibility?: EventVisibility;
  requested_by_user_id?: string | null;
  is_public?: boolean;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface EventUpdateInput {
  title?: string;
  address?: string | null;
  type?: EventType;
  event_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  description?: string | null;
  image_url?: string | null;
  extra_data?: EventExtraData;
  status?: EventStatus;
  setup_status?: EventSetupStatus;
  setup_completed_at?: string | null;
  creation_method?: EventCreationMethod;
  plotting_calendar_id?: string | null;
  hosting_organization?: string | null;
  visibility?: EventVisibility;
  completed_at?: string | null;
  actual_collected_bags?: number | null;
  actual_donors?: number | null;
  wastage_units?: number | null;
  post_event_notes?: string | null;
  post_event_attachments?: string[];
  is_public?: boolean;
  updated_by?: string | null;
}

export type EventStaffRole = 'lead' | 'coordinator' | 'staff' | 'volunteer';

export interface EventStaffRow {
  id: string;
  org_id: string;
  event_id: string;
  user_id: string;
  assignment_role: EventStaffRole;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventStaffCreateInput {
  org_id: string;
  event_id: string;
  user_id: string;
  assignment_role: EventStaffRole;
  notes?: string | null;
}

export interface EventStaffUpdateInput {
  assignment_role?: EventStaffRole;
  notes?: string | null;
}

export interface EventParticipantRow {
  id: string;
  org_id: string;
  event_id: string;
  participant_type: ParticipantType;
  participant_user_id: string | null;
  participant_donor_id: string | null;
  status: ParticipantStatus;
  applied_at: string;
  confirmed_at: string | null;
  participated_at: string | null;
  donated_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventParticipantCreateInput {
  org_id: string;
  event_id: string;
  participant_type: ParticipantType;
  participant_user_id?: string | null;
  participant_donor_id?: string | null;
  status?: ParticipantStatus;
  notes?: string | null;
}

export interface EventParticipantUpdateInput {
  status?: ParticipantStatus;
  confirmed_at?: string | null;
  participated_at?: string | null;
  donated_at?: string | null;
  notes?: string | null;
}

export interface EventApprovalRow {
  id: string;
  org_id: string;
  event_id: string;
  acted_by_user_id: string | null;
  action: EventApprovalAction;
  from_status: EventStatus | null;
  to_status: EventStatus;
  approval_level: string | null;
  geo_scope: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventApprovalCreateInput {
  org_id: string;
  event_id: string;
  acted_by_user_id?: string | null;
  action: EventApprovalAction;
  from_status?: EventStatus | null;
  to_status: EventStatus;
  approval_level?: string | null;
  geo_scope?: Record<string, unknown> | null;
  notes?: string | null;
}

export type PlottingCalendarAccessType = 'org' | 'users' | 'organizations' | 'share_token';
export type PlottingCalendarStatus = 'active' | 'closed' | 'expired' | 'archived';
export type PlottingCalendarDayStatus = 'open' | 'unavailable' | 'fully_booked';
export type PlottingCalendarSlotStatus = 'open' | 'unavailable' | 'fully_booked';

export interface PlottingCalendarRow {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  allowed_dates: string[];
  allowed_time_slots: Array<{
    label?: string;
    start_time: string;
    end_time: string;
  }>;
  allowed_event_types: EventType[];
  max_events_per_date: number | null;
  max_events_per_slot: number | null;
  access_type: PlottingCalendarAccessType;
  allowed_user_ids: string[];
  allowed_organization_ids: string[];
  share_token: string | null;
  expires_at: string | null;
  status: PlottingCalendarStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlottingCalendarDayRow {
  id: string;
  plotting_calendar_id: string;
  date: string;
  status: PlottingCalendarDayStatus;
  max_events_for_day: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlottingCalendarTimeSlotRow {
  id: string;
  plotting_calendar_day_id: string;
  starts_at: string;
  ends_at: string;
  label: string | null;
  status: PlottingCalendarSlotStatus;
  max_events_for_slot: number | null;
  created_at: string;
  updated_at: string;
}

export interface PlottingCalendarAvailabilityDayInput {
  date: string;
  status?: PlottingCalendarDayStatus;
  max_events_for_day?: number | null;
  notes?: string | null;
  slots?: Array<{
    label?: string | null;
    starts_at: string;
    ends_at: string;
    status?: PlottingCalendarSlotStatus;
    max_events_for_slot?: number | null;
  }>;
}

export interface PlottingCalendarAvailabilityInput {
  days: PlottingCalendarAvailabilityDayInput[];
  replace_existing?: boolean;
}

export interface PlottingCalendarCreateInput {
  org_id: string;
  title: string;
  description?: string | null;
  allowed_dates: string[];
  allowed_time_slots: PlottingCalendarRow['allowed_time_slots'];
  allowed_event_types: EventType[];
  max_events_per_date?: number | null;
  max_events_per_slot?: number | null;
  access_type?: PlottingCalendarAccessType;
  allowed_user_ids?: string[];
  allowed_organization_ids?: string[];
  share_token?: string | null;
  expires_at?: string | null;
  status?: PlottingCalendarStatus;
  created_by?: string | null;
}

export interface PlottingCalendarUpdateInput {
  title?: string;
  description?: string | null;
  allowed_dates?: string[];
  allowed_time_slots?: PlottingCalendarRow['allowed_time_slots'];
  allowed_event_types?: EventType[];
  max_events_per_date?: number | null;
  max_events_per_slot?: number | null;
  access_type?: PlottingCalendarAccessType;
  allowed_user_ids?: string[];
  allowed_organization_ids?: string[];
  share_token?: string | null;
  expires_at?: string | null;
  status?: PlottingCalendarStatus;
}
