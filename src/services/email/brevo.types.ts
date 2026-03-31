export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  accepted?: string[];
  rejected?: string[];
  response?: string;
  provider: 'brevo-smtp';
}

export interface DailyEmailCounter {
  date: string;
  sent: number;
  limit: number;
}

export interface BrevoEnvConfig {
  dailyLimit: number;
  smtpHost: string;
  smtpPort: number;
  smtpLogin: string;
  smtpPassword: string;
  smtpApiKey?: string;
  secure: boolean;
  defaultFrom: string;
  warningThreshold: number;
}

export type EmailErrorCode =
  | 'INVALID_RECIPIENT'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'SMTP_CONNECTION_FAILED'
  | 'UNKNOWN_EMAIL_ERROR';

export interface EmailServiceError extends Error {
  code: EmailErrorCode;
  statusCode?: number;
  details?: unknown;
}
