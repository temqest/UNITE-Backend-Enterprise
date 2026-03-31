/**
 * Send Verification Code Service
 * Generates and sends 6-digit OTP via email during signup
 */

import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'crypto';
import { sendVerificationEmail } from '../email/brevo.service';
import { AuthError, AuthErrorCode } from './auth.types';

export interface SendVerificationCodeInput {
  email: string;
  authUserId: string;
  firstName?: string;
}

export interface SendVerificationCodeResult {
  success: boolean;
  message: string;
  expiresIn: number; // seconds
}

function readRequiredEnv(primaryName: string, ...fallbackNames: string[]): string {
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
const supabaseServiceKey = readRequiredEnv(
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABSE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY'
);
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const VERIFICATION_CODE_EXPIRY_MINUTES = 10;
const VERIFICATION_CODE_MAX_LENGTH = 6;

/**
 * Generate a random 6-digit verification code
 */
function generateVerificationCode(): string {
  const min = Math.pow(10, VERIFICATION_CODE_MAX_LENGTH - 1); // 100000
  const max = Math.pow(10, VERIFICATION_CODE_MAX_LENGTH) - 1; // 999999
  const code = randomInt(min, max + 1);
  return code.toString();
}

/**
 * Send verification code email during signup
 * - Generates random 6-digit code
 * - Stores in email_verification_codes table with expiry
 * - Sends email via Brevo
 * - Cleans up expired codes
 */
export async function sendVerificationCode(
  input: SendVerificationCodeInput
): Promise<SendVerificationCodeResult> {
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
        code: AuthErrorCode.UNKNOWN_ERROR,
        message: 'Failed to generate verification code.',
        details: insertError,
      } as AuthError;
    }

    // Send email
    try {
      await sendVerificationEmail({
        email: normalizedEmail,
        firstName,
        code,
        expiresInMinutes: VERIFICATION_CODE_EXPIRY_MINUTES,
      });
    } catch (emailError) {
      throw {
        code: AuthErrorCode.UNKNOWN_ERROR,
        message: 'Failed to send verification email. Please try again.',
        details: emailError,
      } as AuthError;
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
  } catch (error) {
    if ((error as AuthError).code) {
      throw error;
    }
    throw {
      code: AuthErrorCode.UNKNOWN_ERROR,
      message: 'An unexpected error occurred while sending verification code.',
      details: error,
    } as AuthError;
  }
}
