"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccessCheckContextSchema = exports.MarkMessageReadInputSchema = exports.GetMessagesFilterSchema = exports.MessageSendInputSchema = exports.ChatCreateInputSchema = void 0;
exports.toServiceError = toServiceError;
exports.isGeoAreaMatch = isGeoAreaMatch;
const zod_1 = require("zod");
// ============================================================================
// ZOD SCHEMAS
// ============================================================================
exports.ChatCreateInputSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid(),
    participant_1_id: zod_1.z.string().uuid(),
    participant_2_id: zod_1.z.string().uuid(),
});
exports.MessageSendInputSchema = zod_1.z.object({
    chat_id: zod_1.z.string().uuid(),
    sender_id: zod_1.z.string().uuid().optional(),
    message_type: zod_1.z.enum(['text', 'image', 'file', 'video', 'link']),
    content: zod_1.z.string().trim().optional(),
    file_url: zod_1.z.string().url().optional(),
});
exports.GetMessagesFilterSchema = zod_1.z.object({
    chat_id: zod_1.z.string().uuid(),
    message_type: zod_1.z.enum(['text', 'image', 'file', 'video', 'link']).optional(),
    limit: zod_1.z.number().int().min(1).max(500).optional().default(50),
    offset: zod_1.z.number().int().min(0).optional().default(0),
    include_unread: zod_1.z.boolean().optional().default(false),
});
exports.MarkMessageReadInputSchema = zod_1.z.object({
    message_id: zod_1.z.string().uuid(),
    read_at: zod_1.z.string().datetime().optional(),
});
exports.AccessCheckContextSchema = zod_1.z.object({
    user_id: zod_1.z.string().uuid(),
    org_id: zod_1.z.string().uuid(),
    role: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    geographic_area: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).nullable(),
});
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Convert Zod errors to ServiceError details
 */
function toServiceError(code, message, details) {
    return {
        code,
        message,
        details,
    };
}
/**
 * Validate geography areas match
 */
function isGeoAreaMatch(geoA, geoB) {
    if (!geoA || !geoB) {
        return true;
    }
    const levelA = geoA.level;
    const levelB = geoB.level;
    if (!levelA || !levelB) {
        return true;
    }
    // Same level and same location
    if (levelA === levelB) {
        const locationA = geoA.location;
        const locationB = geoB.location;
        if (locationA && locationB) {
            return JSON.stringify(locationA) === JSON.stringify(locationB);
        }
    }
    // One contains the other
    const parentA = geoA.parent;
    const parentB = geoB.parent;
    if (parentA && JSON.stringify(parentA) === JSON.stringify(geoB)) {
        return true;
    }
    if (parentB && JSON.stringify(parentB) === JSON.stringify(geoA)) {
        return true;
    }
    return false;
}
