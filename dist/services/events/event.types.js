"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_HIERARCHY = void 0;
exports.toServiceError = toServiceError;
exports.hasPermission = hasPermission;
exports.getRoleRank = getRoleRank;
exports.hasRoleAtLeast = hasRoleAtLeast;
exports.isGeoAreaMatch = isGeoAreaMatch;
exports.canTransitionEventStatus = canTransitionEventStatus;
exports.buildEventSearchText = buildEventSearchText;
exports.isActiveParticipantStatus = isActiveParticipantStatus;
exports.ROLE_HIERARCHY = {
    donor: 0,
    volunteer: 1,
    stakeholder: 2,
    staff: 3,
    coordinator: 4,
    admin: 5,
    super_admin: 6,
};
function toServiceError(code, message, details) {
    return { code, message, details };
}
function hasPermission(user, permission) {
    if (user.role.type === 'super_admin') {
        return true;
    }
    const requested = normalizePermission(permission);
    const permissions = new Set((user.role.permissions ?? []).map(normalizePermission).filter(Boolean));
    return permissions.has('*') || permissions.has(requested);
}
function getRoleRank(roleType) {
    return exports.ROLE_HIERARCHY[roleType] ?? -1;
}
function hasRoleAtLeast(user, minRoleType) {
    return getRoleRank(user.role.type) >= getRoleRank(minRoleType);
}
function toStringOrEmpty(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
function isGeoAreaMatch(source, target) {
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
function canTransitionEventStatus(fromStatus, toStatus) {
    const allowed = {
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
function buildEventSearchText(event) {
    return [event.title, event.address ?? '', event.description ?? ''].join(' ').toLowerCase();
}
function isActiveParticipantStatus(status) {
    return status === 'applied' || status === 'confirmed' || status === 'participated' || status === 'donated';
}
function normalizePermission(permission) {
    const normalized = permission.trim().toLowerCase();
    if (!normalized) {
        return normalized;
    }
    const aliases = {
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
