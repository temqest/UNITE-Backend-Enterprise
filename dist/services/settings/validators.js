"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateOrgSettingsCreate = validateOrgSettingsCreate;
exports.validateOrgSettingsUpdate = validateOrgSettingsUpdate;
exports.validateUserSettingsCreate = validateUserSettingsCreate;
exports.validateUserSettingsUpdate = validateUserSettingsUpdate;
exports.validateEventAgainstSettings = validateEventAgainstSettings;
exports.parseIsoDate = parseIsoDate;
exports.isWeekend = isWeekend;
exports.getDayOfWeek = getDayOfWeek;
exports.getDayName = getDayName;
const zod_1 = require("zod");
/**
 * Validates that a value is an integer in range [0, 6] representing day of week.
 */
function isDayOfWeek(val) {
    return typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 6;
}
/**
 * Validates that a value is an ISO date string in YYYY-MM-DD format.
 */
function isIsoDate(val) {
    if (typeof val !== 'string')
        return false;
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(val);
    if (!iso)
        return false;
    // Additional check: ensure it's a valid date
    const d = new Date(val + 'T00:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(val);
}
/**
 * Zod schema for OrganizationSettingsCreateInput validation.
 */
const OrgSettingsCreateSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid('org_id must be a valid UUID'),
    max_blood_bags_per_day: zod_1.z
        .number()
        .int('max_blood_bags_per_day must be an integer')
        .positive('max_blood_bags_per_day must be positive')
        .optional(),
    max_events_per_day: zod_1.z
        .number()
        .int('max_events_per_day must be an integer')
        .positive('max_events_per_day must be positive')
        .optional(),
    event_request_advance_days: zod_1.z
        .number()
        .int('event_request_advance_days must be an integer')
        .nonnegative('event_request_advance_days must be >= 0')
        .optional(),
    prevent_double_booking_same_day: zod_1.z.boolean().optional(),
    allow_weekend_events: zod_1.z.boolean().optional(),
    banned_days_of_week: zod_1.z
        .array(zod_1.z.number().int().refine(isDayOfWeek, {
        message: 'banned_days_of_week must contain integers 0-6 (Sunday-Saturday)',
    }))
        .optional(),
    banned_specific_dates: zod_1.z
        .array(zod_1.z.string().refine(isIsoDate, {
        message: 'banned_specific_dates must contain valid ISO dates (YYYY-MM-DD)',
    }))
        .optional(),
    config: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/**
 * Zod schema for OrganizationSettingsUpdateInput validation.
 */
const OrgSettingsUpdateSchema = zod_1.z.object({
    max_blood_bags_per_day: zod_1.z
        .number()
        .int('max_blood_bags_per_day must be an integer')
        .positive('max_blood_bags_per_day must be positive')
        .optional(),
    max_events_per_day: zod_1.z
        .number()
        .int('max_events_per_day must be an integer')
        .positive('max_events_per_day must be positive')
        .optional(),
    event_request_advance_days: zod_1.z
        .number()
        .int('event_request_advance_days must be an integer')
        .nonnegative('event_request_advance_days must be >= 0')
        .optional(),
    prevent_double_booking_same_day: zod_1.z.boolean().optional(),
    allow_weekend_events: zod_1.z.boolean().optional(),
    banned_days_of_week: zod_1.z
        .array(zod_1.z.number().int().refine(isDayOfWeek, {
        message: 'banned_days_of_week must contain integers 0-6 (Sunday-Saturday)',
    }))
        .optional(),
    banned_specific_dates: zod_1.z
        .array(zod_1.z.string().refine(isIsoDate, {
        message: 'banned_specific_dates must contain valid ISO dates (YYYY-MM-DD)',
    }))
        .optional(),
    config: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/**
 * Zod schema for UserSettingsCreateInput validation.
 */
const UserSettingsCreateSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid('org_id must be a valid UUID'),
    user_id: zod_1.z.string().uuid('user_id must be a valid UUID'),
    enable_email_notifications: zod_1.z.boolean().optional(),
    enable_in_app_notifications: zod_1.z.boolean().optional(),
    enable_all_notifications: zod_1.z.boolean().optional(),
    preferences: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/**
 * Zod schema for UserSettingsUpdateInput validation.
 */
const UserSettingsUpdateSchema = zod_1.z.object({
    enable_email_notifications: zod_1.z.boolean().optional(),
    enable_in_app_notifications: zod_1.z.boolean().optional(),
    enable_all_notifications: zod_1.z.boolean().optional(),
    preferences: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/**
 * Validates organization settings create input.
 * Throws if validation fails.
 */
function validateOrgSettingsCreate(input) {
    return OrgSettingsCreateSchema.parse(input);
}
/**
 * Validates organization settings update input.
 * Throws if validation fails.
 */
function validateOrgSettingsUpdate(input) {
    return OrgSettingsUpdateSchema.parse(input);
}
/**
 * Validates user settings create input.
 * Throws if validation fails.
 */
function validateUserSettingsCreate(input) {
    return UserSettingsCreateSchema.parse(input);
}
/**
 * Validates user settings update input.
 * Throws if validation fails.
 */
function validateUserSettingsUpdate(input) {
    return UserSettingsUpdateSchema.parse(input);
}
/**
 * Validates an event request against organization settings.
 * Returns violations list; empty list means no violations.
 *
 * @param settings The organization settings (safe with defaults applied)
 * @param context Event validation context (dates, counts, etc.)
 * @returns EventSettingsValidationResult
 */
function validateEventAgainstSettings(settings, context) {
    const violations = [];
    // 1. Check advance days requirement.
    if (settings.event_request_advance_days > 0) {
        const requestDate = new Date(context.requested_date + 'T00:00:00Z');
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const daysUntilEvent = Math.floor((requestDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilEvent < settings.event_request_advance_days) {
            violations.push(`Event must be requested at least ${settings.event_request_advance_days} days in advance. ` +
                `${daysUntilEvent} days remaining.`);
        }
    }
    // 2. Check weekend restriction.
    if (!settings.allow_weekend_events && context.is_weekend === true) {
        violations.push('Weekend events are not allowed in this organization.');
    }
    // 3. Check banned days of week.
    if (settings.banned_days_of_week && settings.banned_days_of_week.length > 0) {
        const eventDate = new Date(context.requested_date + 'T00:00:00Z');
        const dayOfWeek = eventDate.getUTCDay(); // 0=Sunday, 6=Saturday
        if (settings.banned_days_of_week.includes(dayOfWeek)) {
            const dayName = [
                'Sunday',
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday',
            ][dayOfWeek];
            violations.push(`Events cannot be scheduled on ${dayName}s.`);
        }
    }
    // 4. Check banned specific dates.
    if (settings.banned_specific_dates && settings.banned_specific_dates.length > 0) {
        if (settings.banned_specific_dates.includes(context.requested_date)) {
            violations.push(`Events cannot be scheduled on ${context.requested_date} (banned date).`);
        }
    }
    // 5. Check max events per day.
    if (settings.max_events_per_day > 0 &&
        context.num_events_today !== undefined &&
        context.num_events_today >= settings.max_events_per_day) {
        violations.push(`Maximum ${settings.max_events_per_day} events per day reached. ` +
            `${context.num_events_today} already scheduled for ${context.requested_date}.`);
    }
    // 6. Check double-booking prevention.
    if (settings.prevent_double_booking_same_day &&
        context.previous_event_date === context.requested_date) {
        violations.push('Double-booking on the same day is not allowed.');
    }
    return {
        isValid: violations.length === 0,
        violations,
    };
}
/**
 * Parses ISO date string and returns Date object at UTC midnight.
 */
function parseIsoDate(dateStr) {
    return new Date(dateStr + 'T00:00:00Z');
}
/**
 * Checks if a given date is a weekend (Saturday or Sunday).
 */
function isWeekend(dateStr) {
    const date = parseIsoDate(dateStr);
    const dayOfWeek = date.getUTCDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // 0=Sunday, 6=Saturday
}
/**
 * Gets day of week as number (0=Sunday, 6=Saturday).
 */
function getDayOfWeek(dateStr) {
    const date = parseIsoDate(dateStr);
    return date.getUTCDay();
}
/**
 * Gets human-readable day name.
 */
function getDayName(dayOfWeek) {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return names[dayOfWeek] || 'Unknown';
}
