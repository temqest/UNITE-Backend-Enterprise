import type {
	EventApprovalAction,
	PlottingCalendarStatus,
	EventParticipantRow,
	EventRow,
	EventCreationMethod,
	EventSetupStatus,
	EventStaffRole,
	EventStatus,
	EventType,
	ParticipantStatus,
	ParticipantType,
} from '../../models/events/types';
import type {
	GeographicArea,
	UserRole,
	UserRow,
} from '../../models/users/types';

export interface ServiceError {
	code: string;
	message: string;
	details?: unknown;
}

export interface ServiceResult<T> {
	data: T | null;
	error: ServiceError | null;
}

export interface EventActorContext {
	id: string;
	org_id: string;
	role: UserRole;
	geographic_area: GeographicArea | null;
	is_active: boolean;
}

export interface EventFilter {
	org_id?: string;
	statuses?: EventStatus[];
	setup_statuses?: EventSetupStatus[];
	types?: EventType[];
	from_date?: string;
	to_date?: string;
	requested_by_user_id?: string;
	include_public?: boolean;
	creation_methods?: EventCreationMethod[];
	hosting_organization?: string;
	search?: string;
	limit?: number;
	offset?: number;
}

export interface PublicEventFilter {
	from_date?: string;
	to_date?: string;
	types?: EventRow['type'][];
	province?: string;
	city?: string;
	search?: string;
	limit?: number;
	offset?: number;
}

export interface ApprovalActionInput {
	event_id: string;
	action: Extract<EventApprovalAction, 'accept' | 'reject' | 'reschedule'>;
	notes?: string | null;
	proposed_event_date?: string;
	proposed_start_time?: string;
	proposed_end_time?: string;
}

export interface EventApprovalAuditMeta {
	from_status: EventStatus;
	to_status: EventStatus;
	action: EventApprovalAction;
	notes?: string | null;
}

export type EventAvailableAction =
	| 'view_private'
	| 'edit_event'
	| 'complete_event_setup'
	| 'publish_event'
	| 'change_event_status'
	| 'cancel_event'
	| 'assign_staff'
	| 'remove_staff'
	| 'apply_as_staff'
	| 'apply_as_donor'
	| 'confirm_participant'
	| 'mark_participated'
	| 'mark_donated';

export interface EventActionAvailability {
	event_id: string;
	status: EventStatus;
	actions: EventAvailableAction[];
}

export interface ReviewerCandidate extends UserRow {
	reviewer_reason: string;
}

export interface EventStatusUpdateInput {
	event_id: string;
	status: Extract<EventStatus, 'draft' | 'plotted' | 'needs_details' | 'scheduled' | 'published' | 'ongoing' | 'completed' | 'cancelled'>;
	notes?: string | null;
}

export interface PlottingCalendarFilter {
	org_id?: string;
	statuses?: PlottingCalendarStatus[];
	search?: string;
	limit?: number;
	offset?: number;
}

export interface AssignStaffInput {
	event_id: string;
	user_id: string;
	assignment_role: EventStaffRole;
	notes?: string | null;
}

export interface RemoveStaffInput {
	event_id: string;
	user_id: string;
}

export interface ParticipantApplyInput {
	event_id: string;
	participant_type: ParticipantType;
	participant_user_id?: string | null;
	participant_donor_id?: string | null;
	notes?: string | null;
}

export interface ParticipantStatusUpdateInput {
	event_id: string;
	participant_id: string;
	status: ParticipantStatus;
	notes?: string | null;
}

export interface EventSubscriptionHandlers {
	onInsert?: (event: EventRow) => void;
	onUpdate?: (event: EventRow) => void;
	onDelete?: (old: Pick<EventRow, 'id' | 'org_id'>) => void;
}

export const ROLE_HIERARCHY: Record<string, number> = {
	donor: 0,
	volunteer: 1,
	stakeholder: 2,
	staff: 3,
	coordinator: 4,
	admin: 5,
	super_admin: 6,
};

export function toServiceError(code: string, message: string, details?: unknown): ServiceError {
	return { code, message, details };
}

export function hasPermission(user: EventActorContext, permission: string): boolean {
	if (user.role.type === 'super_admin') {
		return true;
	}

	const requested = normalizePermission(permission);
	const permissions = new Set((user.role.permissions ?? []).map(normalizePermission).filter(Boolean));
	return permissions.has('*') || permissions.has(requested);
}

export function getRoleRank(roleType: string): number {
	return ROLE_HIERARCHY[roleType] ?? -1;
}

export function hasRoleAtLeast(user: EventActorContext, minRoleType: string): boolean {
	return getRoleRank(user.role.type) >= getRoleRank(minRoleType);
}

function toStringOrEmpty(value: unknown): string {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isGeoAreaMatch(
	source: GeographicArea | Record<string, unknown> | null | undefined,
	target: GeographicArea | Record<string, unknown> | null | undefined
): boolean {
	if (!source || !target) {
		return true;
	}

	const sourceProvince = toStringOrEmpty(source.province);
	const targetProvince = toStringOrEmpty(target.province);
	if (sourceProvince && targetProvince && sourceProvince !== targetProvince) {
		return false;
	}

	const sourceCity = toStringOrEmpty(source.city);
	const targetCity = toStringOrEmpty(target.city);
	if (sourceCity && targetCity && sourceCity !== targetCity) {
		return false;
	}

	const sourceBarangay = toStringOrEmpty(source.barangay);
	const targetBarangay = toStringOrEmpty(target.barangay);
	if (sourceBarangay && targetBarangay && sourceBarangay !== targetBarangay) {
		return false;
	}

	const sourceDistricts = Array.isArray(source.districts) ? source.districts : [];
	const targetDistricts = Array.isArray(target.districts) ? target.districts : [];

	if (sourceDistricts.length > 0 && targetDistricts.length > 0) {
		const targetSet = new Set(targetDistricts.map((v) => String(v)));
		const hasAny = sourceDistricts.some((v) => targetSet.has(String(v)));
		if (!hasAny) {
			return false;
		}
	}

	return true;
}

export function canTransitionEventStatus(fromStatus: EventStatus, toStatus: EventStatus): boolean {
	const allowed: Record<EventStatus, EventStatus[]> = {
		draft: ['draft', 'needs_details', 'scheduled', 'published', 'cancelled'],
		plotted: ['plotted', 'needs_details', 'scheduled', 'published', 'cancelled'],
		needs_details: ['needs_details', 'scheduled', 'published', 'cancelled'],
		scheduled: ['scheduled', 'needs_details', 'published', 'ongoing', 'completed', 'cancelled'],
		published: ['published', 'scheduled', 'ongoing', 'completed', 'cancelled'],
		ongoing: ['ongoing', 'completed', 'cancelled'],
		completed: ['completed'],
		cancelled: ['cancelled'],
	};

	return allowed[fromStatus]?.includes(toStatus) ?? false;
}

export function buildEventSearchText(event: Pick<EventRow, 'title' | 'address' | 'description'>): string {
	return [event.title, event.address ?? '', event.description ?? ''].join(' ').toLowerCase();
}

export function isActiveParticipantStatus(status: ParticipantStatus): boolean {
	return status === 'applied' || status === 'confirmed' || status === 'participated' || status === 'donated';
}

export interface ParticipantWithEvent extends EventParticipantRow {
	event?: Pick<EventRow, 'id' | 'org_id' | 'status' | 'event_date' | 'title'>;
}

function normalizePermission(permission: string): string {
	const normalized = permission.trim().toLowerCase();
	if (!normalized) {
		return normalized;
	}

	const aliases: Record<string, string> = {
		create_events: 'events.create',
		manage_events: 'events.update',
		edit_events: 'events.update',
		view_events: 'events.read',
		approve_events: 'events.approve',
		auto_approve_events: 'events.approve',
		assign_event_staff: 'events.update',
		manage_event_participants: 'events.update',
	};

	return aliases[normalized] ?? normalized.replace(/_/g, '.');
}
