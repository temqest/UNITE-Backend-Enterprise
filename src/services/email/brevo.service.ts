import nodemailer, { Transporter } from 'nodemailer';
import { z } from 'zod';
import {
  BrevoEnvConfig,
  EmailOptions,
  EmailServiceError,
  SendEmailResult,
} from './brevo.types';
import {
  formatFromAddress,
  getDailyCount,
  incrementDailyCount,
  isDailyLimitExceeded,
  normalizeRecipients,
  setDailyLimit,
  shouldWarnLimit,
} from './email.utils';

const emailOptionsSchema = z
  .object({
    to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
    subject: z.string().trim().min(1),
    text: z.string().optional(),
    html: z.string().optional(),
    from: z.string().optional(),
  })
  .refine((data) => Boolean(data.text || data.html), {
    message: 'Either text or html content is required.',
    path: ['text'],
  });

function getBrevoConfig(): BrevoEnvConfig {
  const dailyLimit = Number(process.env.DAILY_EMAIL_LIMIT ?? 200);
  const smtpHost =
    process.env.BREVO_SMPT_SERVER?.trim() ||
    process.env.BREVO_SMTP?.trim() ||
    'smtp-relay.brevo.com';

  const smtpPort = Number(process.env.BREVO_SMPT_Port ?? 587);
  const smtpLogin = process.env.BREVO_SMPT_Login?.trim() ?? '';
  const smtpPassword =
    process.env.BREVO_SMPT_Password?.trim() || process.env.BREVO_SMPT_KEY?.trim() || '';
  const smtpApiKey = process.env.BREVO_EMAIL_API?.trim();
  const secure = smtpPort === 465;
  const defaultFrom = process.env.DEFAULT_EMAIL_FROM ?? 'Blood Bank App <no-reply@yourdomain.com>';

  return {
    dailyLimit: Number.isFinite(dailyLimit) && dailyLimit > 0 ? Math.floor(dailyLimit) : 200,
    smtpHost,
    smtpPort,
    smtpLogin,
    smtpPassword,
    smtpApiKey,
    secure,
    defaultFrom,
    warningThreshold: 0.8,
  };
}

const brevoConfig = getBrevoConfig();
setDailyLimit(brevoConfig.dailyLimit);

function createEmailServiceError(
  message: string,
  code: EmailServiceError['code'],
  statusCode?: number,
  details?: unknown
): EmailServiceError {
  const error = new Error(message) as EmailServiceError;
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function assertBrevoSmtpConfig(config: BrevoEnvConfig): void {
  if (!config.smtpHost) {
    throw createEmailServiceError('BREVO SMTP host is missing.', 'SMTP_CONNECTION_FAILED');
  }
  if (!config.smtpLogin) {
    throw createEmailServiceError('BREVO_SMPT_Login is missing.', 'AUTH_FAILED');
  }
  if (!config.smtpPassword) {
    throw createEmailServiceError('BREVO_SMPT_Password or BREVO_SMPT_KEY is missing.', 'AUTH_FAILED');
  }
}

assertBrevoSmtpConfig(brevoConfig);

export const brevoTransporter: Transporter = nodemailer.createTransport({
  host: brevoConfig.smtpHost,
  port: brevoConfig.smtpPort,
  secure: brevoConfig.secure,
  auth: {
    user: brevoConfig.smtpLogin,
    pass: brevoConfig.smtpPassword,
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  requireTLS: brevoConfig.smtpPort === 587,
  tls: {
    minVersion: 'TLSv1.2',
  },
});

export async function verifyBrevoConnection(): Promise<boolean> {
  try {
    await brevoTransporter.verify();
    return true;
  } catch (error) {
    throw mapEmailError(error);
  }
}

function mapEmailError(error: unknown): EmailServiceError {
  const candidate = error as {
    code?: string;
    responseCode?: number;
    command?: string;
    response?: string;
    message?: string;
  };

  if (candidate?.responseCode === 550 || /invalid recipient|recipient address rejected/i.test(candidate?.message ?? '')) {
    return createEmailServiceError(
      'Invalid recipient email address.',
      'INVALID_RECIPIENT',
      candidate.responseCode,
      error
    );
  }

  if (candidate?.code === 'EAUTH' || candidate?.responseCode === 535) {
    return createEmailServiceError(
      'SMTP authentication failed. Check BREVO_SMPT_Login and SMTP key/password.',
      'AUTH_FAILED',
      candidate.responseCode,
      error
    );
  }

  if (candidate?.responseCode === 429 || /too many|rate limit|quota/i.test(candidate?.message ?? '')) {
    return createEmailServiceError(
      'Brevo rate limit reached.',
      'RATE_LIMITED',
      candidate.responseCode,
      error
    );
  }

  if (candidate?.code === 'ESOCKET' || candidate?.code === 'ECONNECTION' || candidate?.code === 'ETIMEDOUT') {
    return createEmailServiceError(
      'Failed to connect to Brevo SMTP relay.',
      'SMTP_CONNECTION_FAILED',
      candidate.responseCode,
      error
    );
  }

  return createEmailServiceError(candidate?.message ?? 'Failed to send email.', 'UNKNOWN_EMAIL_ERROR', candidate?.responseCode, error);
}

function warnIfApproachingDailyLimit(): void {
  if (!shouldWarnLimit(brevoConfig.warningThreshold)) {
    return;
  }
  const daily = getDailyCount();
  const usage = Math.round((daily.sent / daily.limit) * 100);
  console.warn(`[email] Daily email usage is high: ${daily.sent}/${daily.limit} (${usage}%).`);
}

export async function sendEmail(options: EmailOptions): Promise<SendEmailResult> {
  const parsed = emailOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw createEmailServiceError(parsed.error.issues[0]?.message ?? 'Invalid email payload.', 'INVALID_RECIPIENT', 400, parsed.error.issues);
  }

  if (isDailyLimitExceeded()) {
    const daily = getDailyCount();
    throw createEmailServiceError(
      `Daily email limit reached (${daily.sent}/${daily.limit}).`,
      'DAILY_LIMIT_EXCEEDED',
      429
    );
  }

  const payload = parsed.data;
  const recipients = normalizeRecipients(payload.to).join(', ');

  try {
    console.log(`[email] Sending email to: ${recipients} | Subject: "${payload.subject}"`);

    const info = await brevoTransporter.sendMail({
      from: formatFromAddress(payload.from ?? brevoConfig.defaultFrom),
      to: recipients,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });

    incrementDailyCount(1);
    warnIfApproachingDailyLimit();

    console.log(`[email] ✅ Email sent successfully to: ${recipients} | Message ID: ${info.messageId}`);

    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted.map((entry: unknown) => String(entry)),
      rejected: info.rejected.map((entry: unknown) => String(entry)),
      response: info.response,
      provider: 'brevo-smtp',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[email] ❌ Failed to send email to: ${recipients} | Error: ${errorMessage}`);
    // Optional fallback to Brevo REST API using BREVO_EMAIL_API when SMTP fails.
    // if (brevoConfig.smtpApiKey) {
    //   await sendWithBrevoRestApi({
    //     apiKey: brevoConfig.smtpApiKey,
    //     to: normalizeRecipients(payload.to),
    //     subject: payload.subject,
    //     text: payload.text,
    //     html: payload.html,
    //     from: formatFromAddress(payload.from ?? brevoConfig.defaultFrom),
    //   });
    // }
    throw mapEmailError(error);
  }
}

/**
 * Send verification code email during signup
 */
export async function sendVerificationEmail(input: {
  email: string;
  firstName: string;
  code: string;
  expiresInMinutes: number;
}): Promise<SendEmailResult> {
  const { email, firstName, code, expiresInMinutes } = input;

  console.log(`[email:verification] Preparing OTP email for: ${email}`);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #e74c3c; color: white; padding: 20px; text-align: center; border-radius: 4px 4px 0 0; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 4px 4px; }
    .code-box { background-color: #fff; border: 2px solid #e74c3c; padding: 15px; margin: 20px 0; text-align: center; }
    .code { font-size: 32px; font-weight: bold; color: #e74c3c; letter-spacing: 5px; }
    .footer { font-size: 12px; color: #666; text-align: center; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Verify Your Email</h1>
    </div>
    <div class="content">
      <p>Hello ${firstName},</p>
      <p>Welcome to Blood Bank Management System! To complete your registration, please verify your email address using the code below:</p>
      <div class="code-box">
        <div class="code">${code}</div>
      </div>
      <p><strong>This code will expire in ${expiresInMinutes} minutes.</strong></p>
      <p>If you did not create this account, please ignore this email.</p>
      <div class="footer">
        <p>&copy; 2026 Blood Bank Management System. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `Verify Your Email

Hello ${firstName},

Welcome to Blood Bank Management System! To complete your registration, please use the verification code below:

${code}

This code will expire in ${expiresInMinutes} minutes.

If you did not create this account, please ignore this email.

© 2026 Blood Bank Management System`;

  return sendEmail({
    to: email,
    subject: 'Verify your Blood Bank Account',
    html,
    text,
  });
}
