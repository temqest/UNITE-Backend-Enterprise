"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_USER_SETTINGS = exports.DEFAULT_ORG_SETTINGS = void 0;
/**
 * Constants for default settings values.
 */
exports.DEFAULT_ORG_SETTINGS = {
    max_blood_bags_per_day: 100,
    max_events_per_day: 5,
    event_request_advance_days: 3,
    prevent_double_booking_same_day: true,
    allow_weekend_events: false,
    banned_days_of_week: [],
    banned_specific_dates: [],
    config: {},
};
/**
 * Constants for default user settings values.
 */
exports.DEFAULT_USER_SETTINGS = {
    enable_email_notifications: true,
    enable_in_app_notifications: true,
    enable_all_notifications: true,
    preferences: {},
};
