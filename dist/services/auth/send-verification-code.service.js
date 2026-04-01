"use strict";
/**
 * Send Verification Code Service
 * Generates and sends 6-digit OTP via email during signup
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendVerificationCode = sendVerificationCode;
const supabase_js_1 = require("@supabase/supabase-js");
const crypto_1 = require("crypto");
const brevo_service_1 = require("../email/brevo.service");
const auth_types_1 = require("./auth.types");
function readRequiredEnv(primaryName, ...fallbackNames) {
    const names = [primaryName, ...fallbackNames];
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) {
            return value;
        }
    }
    throw new Error(`[auth] Missing required environment variable: ${names.join(' or ')}`);
}
const supabaseUrl = readRequiredEnv('SUPABASE_URL');
const supabaseServiceKey = readRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABSE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
const VERIFICATION_CODE_EXPIRY_MINUTES = 10;
const VERIFICATION_CODE_MAX_LENGTH = 6;
/**
 * Generate a random 6-digit verification code
 */
function generateVerificationCode() {
    const min = Math.pow(10, VERIFICATION_CODE_MAX_LENGTH - 1); // 100000
    const max = Math.pow(10, VERIFICATION_CODE_MAX_LENGTH) - 1; // 999999
    const code = (0, crypto_1.randomInt)(min, max + 1);
    return code.toString();
}
/**
 * Send verification code email during signup
 * - Generates random 6-digit code
 * - Stores in email_verification_codes table with expiry
 * - Sends email via Brevo
 * - Cleans up expired codes
 */
async function sendVerificationCode(input) {
    try {
        const { email, authUserId, firstName = 'User' } = input;
        const normalizedEmail = email.toLowerCase().trim();
        await supabase
            .from('email_verification_codes')
            .delete()
            .eq('auth_user_id', authUserId)
            .eq('email', normalizedEmail)
            .eq('is_used', false);
        // Generate code
        const code = generateVerificationCode();
        // Calculate expiry: 10 minutes from now
        const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000);
        // Store code in database
        const { error: insertError } = await supabase
            .from('email_verification_codes')
            .insert({
            auth_user_id: authUserId,
            email: normalizedEmail,
            code,
            expires_at: expiresAt.toISOString(),
            attempts: 0,
            max_attempts: 5,
        });
        if (insertError) {
            throw {
                code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
                message: 'Failed to generate verification code.',
                details: insertError,
            };
        }
        // Send email
        try {
            await (0, brevo_service_1.sendVerificationEmail)({
                email: normalizedEmail,
                firstName,
                code,
                expiresInMinutes: VERIFICATION_CODE_EXPIRY_MINUTES,
            });
        }
        catch (emailError) {
            throw {
                code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
                message: 'Failed to send verification email. Please try again.',
                details: emailError,
            };
        }
        // Clean up old expired codes for this email (optional housekeeping)
        await supabase
            .from('email_verification_codes')
            .delete()
            .eq('auth_user_id', authUserId)
            .eq('email', normalizedEmail)
            .lt('expires_at', new Date().toISOString())
            .eq('is_used', false);
        return {
            success: true,
            message: `Verification code sent to ${email}. It will expire in ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes.`,
            expiresIn: VERIFICATION_CODE_EXPIRY_MINUTES * 60,
        };
    }
    catch (error) {
        if (error.code) {
            throw error;
        }
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'An unexpected error occurred while sending verification code.',
            details: error,
        };
    }
}
