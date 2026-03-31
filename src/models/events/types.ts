// events/types.ts
export type EventType = 'blood_drive' | 'training' | 'advocacy' | 'assembly';
export type EventStatus = 'requested' | 'pending' | 'approved' | 'rejected' | 'rescheduled';

export type ParticipantType = 'user' | 'donor';
export type ParticipantStatus = 'applied' | 'confirmed' | 'participated' | 'donated';

export type EventApprovalAction = 'request' | 'accept' | 'reject' | 'reschedule' | 'auto_approve';

export interface BloodDriveExtraData {
  target_donation: number;
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

export type EventExtraData = BloodDriveExtraData | TrainingExtraData | AdvocacyExtraData | AssemblyExtraData;

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
  address: string;
  type: EventType;
  event_date: string;
  start_time: string;
  end_time: string;
  description: string | null;
  image_url: string | null;
  extra_data: EventExtraData;
  status: EventStatus;
  requested_by_user_id: string | null;
  requested_by?: EventRequesterSummary | null;
  latest_approval?: EventLatestApprovalSummary | null;
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  rescheduled_at: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventCreateInput {
  org_id: string;
  title: string;
  address: string;
  type: EventType;
  event_date: string;
  start_time: string;
  end_time: string;
  description?: string | null;
  image_url?: string | null;
  extra_data: EventExtraData;
  status?: EventStatus;
  requested_by_user_id?: string | null;
  is_public?: boolean;
}

export interface EventUpdateInput {
  title?: string;
  address?: string;
  type?: EventType;
  event_date?: string;
  start_time?: string;
  end_time?: string;
  description?: string | null;
  image_url?: string | null;
  extra_data?: EventExtraData;
  status?: EventStatus;
  is_public?: boolean;
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
