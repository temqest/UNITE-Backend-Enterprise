import { type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';

function getEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function rateLimitErrorHandler(_req: Request, res: Response): void {
  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
  });
}

export const authLoginRateLimiter = rateLimit({
  windowMs: getEnvInt('AUTH_LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  max: getEnvInt('AUTH_LOGIN_RATE_LIMIT_MAX', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitErrorHandler,
});

export const authOtpRateLimiter = rateLimit({
  windowMs: getEnvInt('AUTH_OTP_RATE_LIMIT_WINDOW_MS', 10 * 60 * 1000),
  max: getEnvInt('AUTH_OTP_RATE_LIMIT_MAX', 5),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitErrorHandler,
});

export const notificationsReadRateLimiter = rateLimit({
  windowMs: getEnvInt('NOTIFICATIONS_READ_RATE_LIMIT_WINDOW_MS', 60 * 1000),
  max: getEnvInt('NOTIFICATIONS_READ_RATE_LIMIT_MAX', 60),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitErrorHandler,
});

export const notificationsWriteRateLimiter = rateLimit({
  windowMs: getEnvInt('NOTIFICATIONS_WRITE_RATE_LIMIT_WINDOW_MS', 60 * 1000),
  max: getEnvInt('NOTIFICATIONS_WRITE_RATE_LIMIT_MAX', 20),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitErrorHandler,
});
