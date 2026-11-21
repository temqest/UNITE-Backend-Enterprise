"use strict";
/**
 * Email OTP Verification Service
 * Finalizes staged signups only after OTP verification succeeds.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifySignupOtp = verifySignupOtp;
exports.canResendVerificationCode = canResendVerificationCode;
const supabase_js_1 = require("@supabase/supabase-js");
const auth_types_1 = require("./auth.types");
const STAFF_PENDING_DEFAULT_ROLE = {
    type: 'viewer',
    permissions: ['campaigns.read', 'events.read', 'reports.read'],
};
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
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
const supabaseService = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
async function cleanupFailedPendingSignup(authUserId, email) {
    const normalizedEmail = normalizeEmail(email);
    await supabaseService
        .from('pending_signups')
        .delete()
        .eq('auth_user_id', authUserId)
        .eq('email', normalizedEmail)
        .eq('status', 'pending');
    await supabaseService
        .from('email_verification_codes')
        .delete()
        .eq('auth_user_id', authUserId)
        .eq('email', normalizedEmail)
        .eq('is_used', false);
    await supabaseService.auth.admin.deleteUser(authUserId);
}
async function finalizePendingSignup(authUserId, email, verificationCodeId) {
    const { data, error } = await supabaseService.rpc('finalize_pending_signup', {
        p_auth_user_id: authUserId,
        p_email: normalizeEmail(email),
        p_verification_code_id: verificationCodeId,
    });
    if (error) {
        return { data: null, error };
    }
    const row = Array.isArray(data)
        ? data[0]
        : data;
    if (!row?.org_id || !row?.user_id || !row?.signup_type) {
        return {
            data: null,
            error: {
                code: 'FINALIZE_RESULT_INVALID',
                message: 'Finalize pending signup did not return a valid result.',
            },
        };
    }
    return { data: row, error: null };
}
/**
 * Verify OTP code during signup.
 * Creates organization/user records only after successful OTP verification.
 */
async function verifySignupOtp(input) {
    try {
        const normalizedEmail = normalizeEmail(input.email);
        const { code, authUserId } = input;
        if (!/^\d{6}$/.test(code)) {
            return {
                success: false,
                message: 'Invalid verification code format.',
                isVerified: false,
            };
        }
        const { data: pendingSignup, error: pendingSignupError } = await supabaseService
            .from('pending_signups')
            .select('id, expires_at, status')
            .eq('auth_user_id', authUserId)
            .eq('email', normalizedEmail)
            .maybeSingle();
        if (pendingSignupError) {
            return {
                success: false,
                message: 'Failed to validate pending signup state. Please try again.',
                isVerified: false,
            };
        }
        if (!pendingSignup || pendingSignup.status !== 'pending') {
            return {
                success: false,
                message: 'No pending signup found. Please restart signup.',
                isVerified: false,
            };
        }
        if (new Date(pendingSignup.expires_at) < new Date()) {
            await cleanupFailedPendingSignup(authUserId, normalizedEmail);
            return {
                success: false,
                message: 'Verification code has expired. Please sign up again.',
                isVerified: false,
            };
        }
        const { data: codeRecord, error: fetchError } = await supabaseService
            .from('email_verification_codes')
            .select('*')
            .eq('auth_user_id', authUserId)
            .eq('email', normalizedEmail)
            .eq('is_used', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        if (fetchError || !codeRecord) {
            return {
                success: false,
                message: 'No active verification code found for this email. Please request a new code.',
                isVerified: false,
            };
        }
        if (new Date(codeRecord.expires_at) < new Date()) {
            await cleanupFailedPendingSignup(authUserId, normalizedEmail);
            return {
                success: false,
                message: 'Verification code has expired. Please sign up again.',
                isVerified: false,
            };
        }
        if (codeRecord.attempts >= codeRecord.max_attempts) {
            await cleanupFailedPendingSignup(authUserId, normalizedEmail);
            return {
                success: false,
                message: 'Too many failed attempts. Please sign up again.',
                isVerified: false,
                remainingAttempts: 0,
            };
        }
        if (codeRecord.code !== code) {
            const updatedAttempts = (codeRecord.attempts || 0) + 1;
            await supabaseService
                .from('email_verification_codes')
                .update({ attempts: updatedAttempts })
                .eq('id', codeRecord.id);
            if (updatedAttempts >= codeRecord.max_attempts) {
                await cleanupFailedPendingSignup(authUserId, normalizedEmail);
                return {
                    success: false,
                    message: 'Too many failed attempts. Please sign up again.',
                    isVerified: false,
                    remainingAttempts: 0,
                };
            }
            const remainingAttempts = Math.max(0, codeRecord.max_attempts - updatedAttempts);
            return {
                success: false,
                message: `Incorrect verification code. You have ${remainingAttempts} attempt(s) remaining.`,
                isVerified: false,
                remainingAttempts,
            };
        }
        const finalizeResult = await finalizePendingSignup(authUserId, normalizedEmail, codeRecord.id);
        if (finalizeResult.error || !finalizeResult.data) {
            await cleanupFailedPendingSignup(authUserId, normalizedEmail);
            return {
                success: false,
                message: 'Failed to finalize signup. Please sign up again.',
                isVerified: false,
            };
        }
        // Safety net: force staff self-signups to remain pending approval even if
        // an older DB finalize function marks them active.
        if (finalizeResult.data.signup_type === 'staff') {
            const { error: enforcePendingError } = await supabaseService
                .from('users')
                .update({
                is_active: false,
                role: STAFF_PENDING_DEFAULT_ROLE,
            })
                .eq('id', finalizeResult.data.user_id)
                .eq('auth_id', authUserId);
            if (enforcePendingError) {
                throw {
                    code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
                    message: 'Failed to place account in pending approval state.',
                    details: enforcePendingError,
                };
            }
        }
        const { error: confirmError } = await supabaseService.auth.admin.updateUserById(authUserId, {
            email_confirm: true,
        });
        if (confirmError) {
            throw {
                code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
                message: 'Failed to confirm email in authentication system.',
                details: confirmError,
            };
        }
        const isStaff = finalizeResult.data.signup_type === 'staff';
        return {
            success: true,
            message: isStaff
                ? 'Email verified successfully. Your account is pending admin approval.'
                : 'Email verified successfully. Your donor account is now active.',
            isVerified: true,
        };
    }
    catch (error) {
        if (error.code) {
            throw error;
        }
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'An unexpected error occurred during verification.',
            details: error,
        };
    }
}
/**
 * Check resend eligibility for an in-progress signup.
 */
async function canResendVerificationCode(email, authUserId) {
    try {
        const normalizedEmail = normalizeEmail(email);
        const { data: pendingSignup, error: pendingSignupError } = await supabaseService
            .from('pending_signups')
            .select('expires_at, status')
            .eq('auth_user_id', authUserId)
            .eq('email', normalizedEmail)
            .maybeSingle();
        if (pendingSignupError) {
            throw {
                code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
                message: 'Failed to validate pending signup.',
                details: pendingSignupError,
            };
        }
        if (!pendingSignup || pendingSignup.status !== 'pending') {
            return {
                canResend: false,
                message: 'No pending signup found. Please sign up again.',
            };
        }
        if (new Date(pendingSignup.expires_at) < new Date()) {
            await cleanupFailedPendingSignup(authUserId, normalizedEmail);
            return {
                canResend: false,
                message: 'Signup verification expired. Please sign up again.',
            };
        }
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count, error: countError } = await supabaseService
            .from('email_verification_codes')
            .select('*', { count: 'exact', head: true })
            .eq('auth_user_id', authUserId)
            .eq('email', normalizedEmail)
            .gt('created_at', oneHourAgo)
            .eq('is_used', false);
        if (countError) {
            throw {
                code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
                message: 'Failed to check resend eligibility.',
                details: countError,
            };
        }
        if ((count ?? 0) >= 3) {
            const oldestCode = await supabaseService
                .from('email_verification_codes')
                .select('created_at')
                .eq('auth_user_id', authUserId)
                .eq('email', normalizedEmail)
                .eq('is_used', false)
                .order('created_at', { ascending: true })
                .limit(1)
                .single();
            if (oldestCode.data) {
                const nextAvailable = new Date(new Date(oldestCode.data.created_at).getTime() + 60 * 60 * 1000).toISOString();
                return {
                    canResend: false,
                    nextAvailableAt: nextAvailable,
                    message: 'Too many verification codes sent. Please try again later.',
                };
            }
        }
        return {
            canResend: true,
            message: 'You can request a new verification code.',
        };
    }
    catch (error) {
        if (error.code) {
            throw error;
        }
        throw {
            code: auth_types_1.AuthErrorCode.UNKNOWN_ERROR,
            message: 'An unexpected error occurred.',
            details: error,
        };
    }
}
