import { DailyEmailCounter } from './brevo.types';

const DEFAULT_WARNING_THRESHOLD = 0.8;

let counter: DailyEmailCounter = {
  date: getTodayKey(),
  sent: 0,
  limit: Number(process.env.DAILY_EMAIL_LIMIT ?? 200),
};

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function resetIfNewDay(): void {
  const today = getTodayKey();
  if (counter.date !== today) {
    counter = {
      date: today,
      sent: 0,
      limit: Number(process.env.DAILY_EMAIL_LIMIT ?? counter.limit ?? 200),
    };
  }
}

export function getDailyCount(): DailyEmailCounter {
  resetIfNewDay();
  return { ...counter };
}

export function incrementDailyCount(step = 1): DailyEmailCounter {
  resetIfNewDay();
  counter.sent += step;
  return { ...counter };
}

export function setDailyLimit(limit: number): void {
  if (!Number.isFinite(limit) || limit <= 0) {
    return;
  }
  resetIfNewDay();
  counter.limit = Math.floor(limit);
}

export function isDailyLimitExceeded(): boolean {
  resetIfNewDay();
  return counter.sent >= counter.limit;
}

export function shouldWarnLimit(threshold = DEFAULT_WARNING_THRESHOLD): boolean {
  resetIfNewDay();
  const normalizedThreshold = threshold > 0 && threshold < 1 ? threshold : DEFAULT_WARNING_THRESHOLD;
  return counter.sent >= Math.floor(counter.limit * normalizedThreshold);
}

export function normalizeRecipients(to: string | string[]): string[] {
  return Array.isArray(to) ? to : [to];
}

export function formatFromAddress(from?: string): string {
  const fallback = process.env.DEFAULT_EMAIL_FROM ?? 'Blood Bank App <no-reply@yourdomain.com>';
  const candidate = (from ?? fallback).trim();
  return candidate.length > 0 ? candidate : fallback;
}
