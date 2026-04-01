"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.brevoTransporter = void 0;
exports.verifyBrevoConnection = verifyBrevoConnection;
exports.sendEmail = sendEmail;
exports.sendVerificationEmail = sendVerificationEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const zod_1 = require("zod");
const email_utils_1 = require("./email.utils");
const emailOptionsSchema = zod_1.z
    .object({
    to: zod_1.z.union([zod_1.z.string().email(), zod_1.z.array(zod_1.z.string().email()).min(1)]),
    subject: zod_1.z.string().trim().min(1),
    text: zod_1.z.string().optional(),
    html: zod_1.z.string().optional(),
    from: zod_1.z.string().optional(),
})
    .refine((data) => Boolean(data.text || data.html), {
    message: 'Either text or html content is required.',
    path: ['text'],
});
function getBrevoConfig() {
    const dailyLimit = Number(process.env.DAILY_EMAIL_LIMIT ?? 200);
    const smtpHost = process.env.BREVO_SMPT_SERVER?.trim() ||
        process.env.BREVO_SMTP?.trim() ||
        'smtp-relay.brevo.com';
    const smtpPort = Number(process.env.BREVO_SMPT_Port ?? 587);
    const smtpLogin = process.env.BREVO_SMPT_Login?.trim() ?? '';
    const smtpPassword = process.env.BREVO_SMPT_Password?.trim() || process.env.BREVO_SMPT_KEY?.trim() || '';
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
(0, email_utils_1.setDailyLimit)(brevoConfig.dailyLimit);
function createEmailServiceError(message, code, statusCode, details) {
    const error = new Error(message);
    error.code = code;
    error.statusCode = statusCode;
    error.details = details;
    return error;
}
function assertBrevoSmtpConfig(config) {
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
exports.brevoTransporter = nodemailer_1.default.createTransport({
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
async function verifyBrevoConnection() {
    try {
        await exports.brevoTransporter.verify();
        return true;
    }
    catch (error) {
        throw mapEmailError(error);
    }
}
function mapEmailError(error) {
    const candidate = error;
    if (candidate?.responseCode === 550 || /invalid recipient|recipient address rejected/i.test(candidate?.message ?? '')) {
        return createEmailServiceError('Invalid recipient email address.', 'INVALID_RECIPIENT', candidate.responseCode, error);
    }
    if (candidate?.code === 'EAUTH' || candidate?.responseCode === 535) {
        return createEmailServiceError('SMTP authentication failed. Check BREVO_SMPT_Login and SMTP key/password.', 'AUTH_FAILED', candidate.responseCode, error);
    }
    if (candidate?.responseCode === 429 || /too many|rate limit|quota/i.test(candidate?.message ?? '')) {
        return createEmailServiceError('Brevo rate limit reached.', 'RATE_LIMITED', candidate.responseCode, error);
    }
    if (candidate?.code === 'ESOCKET' || candidate?.code === 'ECONNECTION' || candidate?.code === 'ETIMEDOUT') {
        return createEmailServiceError('Failed to connect to Brevo SMTP relay.', 'SMTP_CONNECTION_FAILED', candidate.responseCode, error);
    }
    return createEmailServiceError(candidate?.message ?? 'Failed to send email.', 'UNKNOWN_EMAIL_ERROR', candidate?.responseCode, error);
}
function warnIfApproachingDailyLimit() {
    if (!(0, email_utils_1.shouldWarnLimit)(brevoConfig.warningThreshold)) {
        return;
    }
    const daily = (0, email_utils_1.getDailyCount)();
    const usage = Math.round((daily.sent / daily.limit) * 100);
    console.warn(`[email] Daily email usage is high: ${daily.sent}/${daily.limit} (${usage}%).`);
}
async function sendEmail(options) {
    const parsed = emailOptionsSchema.safeParse(options);
    if (!parsed.success) {
        throw createEmailServiceError(parsed.error.issues[0]?.message ?? 'Invalid email payload.', 'INVALID_RECIPIENT', 400, parsed.error.issues);
    }
    if ((0, email_utils_1.isDailyLimitExceeded)()) {
        const daily = (0, email_utils_1.getDailyCount)();
        throw createEmailServiceError(`Daily email limit reached (${daily.sent}/${daily.limit}).`, 'DAILY_LIMIT_EXCEEDED', 429);
    }
    const payload = parsed.data;
    const recipients = (0, email_utils_1.normalizeRecipients)(payload.to).join(', ');
    try {
        console.log(`[email] Sending email to: ${recipients} | Subject: "${payload.subject}"`);
        const info = await exports.brevoTransporter.sendMail({
            from: (0, email_utils_1.formatFromAddress)(payload.from ?? brevoConfig.defaultFrom),
            to: recipients,
            subject: payload.subject,
            text: payload.text,
            html: payload.html,
        });
        (0, email_utils_1.incrementDailyCount)(1);
        warnIfApproachingDailyLimit();
        console.log(`[email] ✅ Email sent successfully to: ${recipients} | Message ID: ${info.messageId}`);
        return {
            success: true,
            messageId: info.messageId,
            accepted: info.accepted.map((entry) => String(entry)),
            rejected: info.rejected.map((entry) => String(entry)),
            response: info.response,
            provider: 'brevo-smtp',
        };
    }
    catch (error) {
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
async function sendVerificationEmail(input) {
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
