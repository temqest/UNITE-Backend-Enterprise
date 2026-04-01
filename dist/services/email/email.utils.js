"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDailyCount = getDailyCount;
exports.incrementDailyCount = incrementDailyCount;
exports.setDailyLimit = setDailyLimit;
exports.isDailyLimitExceeded = isDailyLimitExceeded;
exports.shouldWarnLimit = shouldWarnLimit;
exports.normalizeRecipients = normalizeRecipients;
exports.formatFromAddress = formatFromAddress;
const DEFAULT_WARNING_THRESHOLD = 0.8;
let counter = {
    date: getTodayKey(),
    sent: 0,
    limit: Number(process.env.DAILY_EMAIL_LIMIT ?? 200),
};
function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}
function resetIfNewDay() {
    const today = getTodayKey();
    if (counter.date !== today) {
        counter = {
            date: today,
            sent: 0,
            limit: Number(process.env.DAILY_EMAIL_LIMIT ?? counter.limit ?? 200),
        };
    }
}
function getDailyCount() {
    resetIfNewDay();
    return { ...counter };
}
function incrementDailyCount(step = 1) {
    resetIfNewDay();
    counter.sent += step;
    return { ...counter };
}
function setDailyLimit(limit) {
    if (!Number.isFinite(limit) || limit <= 0) {
        return;
    }
    resetIfNewDay();
    counter.limit = Math.floor(limit);
}
function isDailyLimitExceeded() {
    resetIfNewDay();
    return counter.sent >= counter.limit;
}
function shouldWarnLimit(threshold = DEFAULT_WARNING_THRESHOLD) {
    resetIfNewDay();
    const normalizedThreshold = threshold > 0 && threshold < 1 ? threshold : DEFAULT_WARNING_THRESHOLD;
    return counter.sent >= Math.floor(counter.limit * normalizedThreshold);
}
function normalizeRecipients(to) {
    return Array.isArray(to) ? to : [to];
}
function formatFromAddress(from) {
    const fallback = process.env.DEFAULT_EMAIL_FROM ?? 'Blood Bank App <no-reply@yourdomain.com>';
    const candidate = (from ?? fallback).trim();
    return candidate.length > 0 ? candidate : fallback;
}
