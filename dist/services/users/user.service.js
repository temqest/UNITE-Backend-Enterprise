"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const zod_1 = require("zod");
const organization_service_1 = require("../organization/organization.service");
const send_verification_code_service_1 = require("../auth/send-verification-code.service");
const rbac_constants_1 = require("../auth/rbac.constants");
const AdminSignupSchema = zod_1.z.object({
    organization: zod_1.z.object({
        name: zod_1.z.string().trim().min(2),
        code: zod_1.z
            .string()
            .trim()
            .min(3)
            .max(32)
            .regex(/^[A-Z0-9_-]+$/),
        contact_email: zod_1.z.string().email().optional().nullable(),
        contact_phone: zod_1.z.string().trim().min(3).max(32).optional().nullable(),
        metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
        is_active: zod_1.z.boolean().optional(),
    }),
    admin: zod_1.z.object({
        email: zod_1.z.string().email(),
        password: zod_1.z.string().min(6).max(128),
        first_name: zod_1.z.string().trim().min(1),
        last_name: zod_1.z.string().trim().min(1),
        geographic_area: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional().nullable(),
    }),
});
const StaffSelfSignupSchema = zod_1.z.object({
    org_code: zod_1.z
        .string()
        .trim()
        .min(3)
        .max(32)
        .regex(/^[A-Z0-9_-]+$/),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6).max(128),
    first_name: zod_1.z.string().trim().min(1),
    last_name: zod_1.z.string().trim().min(1),
    geographic_area: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional().nullable(),
});
const AdminCreateStaffSchemaBase = zod_1.z.object({
    requester_auth_id: zod_1.z.string().uuid(),
    org_id: zod_1.z.string().uuid(),
    email: zod_1.z.string().email(),
    first_name: zod_1.z.string().trim().min(1),
    last_name: zod_1.z.string().trim().min(1),
    role: zod_1.z.object({
        type: zod_1.z.string().min(1),
        permissions: zod_1.z.array(zod_1.z.string()).default([]),
    }),
    geographic_area: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional().nullable(),
    send_invite_email: zod_1.z.boolean().optional(),
    temporary_password: zod_1.z.string().min(6).max(128).optional(),
});
const AdminCreateStaffSchema = AdminCreateStaffSchemaBase
    .superRefine((val, ctx) => {
    if (!val.send_invite_email && !val.temporary_password) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'temporary_password is required when send_invite_email is false.',
            path: ['temporary_password'],
        });
    }
});
const ApproveUserSchema = zod_1.z.object({
    requester_auth_id: zod_1.z.string().uuid(),
    user_id: zod_1.z.string().uuid(),
    role_type: zod_1.z.string().trim().min(1).max(64).optional(),
    sector: zod_1.z.enum(['LGU', 'NON-LGU', 'Others', 'none']).optional(),
});
function toServiceError(code, message, details) {
    return { code, message, details };
}
function normalizeCode(code) {
    return code.trim().toUpperCase();
}
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
const PENDING_SIGNUP_EXPIRY_MINUTES = 10;
function buildSuperAdminRole() {
    return {
        type: 'super_admin',
        permissions: ['*'],
    };
}
function buildStaffRole() {
    return {
        type: 'staff',
        permissions: [],
    };
}
function buildViewerRole() {
    return {
        type: 'viewer',
        permissions: [...(rbac_constants_1.ROLE_DEFAULT_PERMISSIONS.viewer ?? [])],
    };
}
function buildRoleByType(roleType) {
    const canonical = (0, rbac_constants_1.resolveCanonicalRole)(roleType);
    return {
        type: canonical,
        permissions: [...(rbac_constants_1.ROLE_DEFAULT_PERMISSIONS[canonical] ?? [])],
    };
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
class UserService {
    supabase;
    notificationService;
    organizationService;
    constructor(supabase, notificationService) {
        this.supabase = supabase;
        this.notificationService = notificationService;
        this.organizationService = new organization_service_1.OrganizationService(supabase);
    }
    async getUserByAuthId(authId) {
        const { data, error } = await this.supabase
            .from('users')
            .select('*')
            .eq('auth_id', authId)
            .single();
        if (error) {
            return {
                data: null,
                error: toServiceError('USER_LOOKUP_FAILED', 'Failed to resolve user.', error),
            };
        }
        return { data: data, error: null };
    }
    async hasActiveSuperAdmin(orgId) {
        const { count, error } = await this.supabase
            .from('users')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('is_active', true)
            .eq('role->>type', 'super_admin');
        if (error) {
            return {
                data: null,
                error: toServiceError('SUPER_ADMIN_CHECK_FAILED', 'Failed to verify super_admin constraint.', error),
            };
        }
        return { data: (count ?? 0) > 0, error: null };
    }
    getAuthErrorCode(error) {
        if (!error || typeof error !== 'object') {
            return undefined;
        }
        const maybeCode = error.code;
        return typeof maybeCode === 'string' ? maybeCode : undefined;
    }
    async findAuthUserByEmail(email) {
        const normalizedEmail = email.trim().toLowerCase();
        const { data, error } = await this.supabase.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
        });
        if (error) {
            return {
                data: null,
                error: toServiceError('AUTH_LIST_USERS_FAILED', 'Failed to list auth users.', error),
            };
        }
        const matchedUser = data?.users?.find((user) => {
            const candidate = typeof user.email === 'string' ? user.email.toLowerCase() : '';
            return candidate === normalizedEmail;
        });
        if (!matchedUser) {
            return {
                data: null,
                error: toServiceError('AUTH_USER_NOT_FOUND', 'Auth user not found by email.'),
            };
        }
        return {
            data: { id: matchedUser.id },
            error: null,
        };
    }
    async createSignupAuthUser(input) {
        const createResult = await this.supabase.auth.admin.createUser({
            email: normalizeEmail(input.email),
            password: input.password,
            email_confirm: false,
            user_metadata: input.user_metadata,
        });
        if (!createResult.error && createResult.data.user?.id) {
            return {
                data: { id: createResult.data.user.id },
                error: null,
            };
        }
        const authErrorCode = this.getAuthErrorCode(createResult.error);
        if (authErrorCode === 'email_exists') {
            const existingAuth = await this.findAuthUserByEmail(input.email);
            if (existingAuth.error || !existingAuth.data) {
                return {
                    data: null,
                    error: toServiceError('EMAIL_EXISTS', 'An account with this email already exists. Please sign in or use a different email.', createResult.error),
                };
            }
            const existingProfile = await this.getUserByAuthIdOptional(existingAuth.data.id);
            if (existingProfile.error) {
                return {
                    data: null,
                    error: existingProfile.error,
                };
            }
            if (existingProfile.data) {
                return {
                    data: null,
                    error: toServiceError('EMAIL_EXISTS', 'An account with this email already exists. Please sign in or use a different email.', createResult.error),
                };
            }
            const { error: updateError } = await this.supabase.auth.admin.updateUserById(existingAuth.data.id, {
                password: input.password,
                user_metadata: {
                    ...(input.user_metadata ?? {}),
                    resumed_signup: true,
                },
            });
            if (updateError) {
                return {
                    data: null,
                    error: toServiceError('AUTH_SIGNUP_RESUME_FAILED', 'Failed to resume existing signup. Please try again.', updateError),
                };
            }
            return {
                data: { id: existingAuth.data.id },
                error: null,
            };
        }
        return {
            data: null,
            error: toServiceError('AUTH_SIGNUP_FAILED', 'Failed to create auth account.', createResult.error),
        };
    }
    async getUserByAuthIdOptional(authId) {
        const { data, error } = await this.supabase
            .from('users')
            .select('*')
            .eq('auth_id', authId)
            .maybeSingle();
        if (error) {
            return {
                data: null,
                error: toServiceError('USER_LOOKUP_FAILED', 'Failed to resolve user.', error),
            };
        }
        return { data: data ?? null, error: null };
    }
    async createUserProfile(input) {
        const { data, error } = await this.supabase
            .from('users')
            .insert({
            org_id: input.org_id,
            auth_id: input.auth_id,
            email: input.email.toLowerCase(),
            first_name: input.first_name,
            last_name: input.last_name,
            role: input.role,
            geographic_area: input.geographic_area ?? null,
            is_active: input.is_active ?? false,
        })
            .select('*')
            .single();
        if (error) {
            return {
                data: null,
                error: toServiceError('USER_CREATE_FAILED', 'Failed to create user profile.', error),
            };
        }
        return { data: data, error: null };
    }
    isAuthForeignKeyRace(errorDetails) {
        if (!errorDetails || typeof errorDetails !== 'object') {
            return false;
        }
        const details = errorDetails;
        const message = details.message ?? '';
        const constraint = details.constraint ?? '';
        return details.code === '23503' && (constraint.includes('users_auth_id_fkey')
            || message.includes('users_auth_id_fkey')
            || message.includes('auth_id'));
    }
    async createUserProfileWithRetry(input) {
        const maxAttempts = 4;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const result = await this.createUserProfile(input);
            if (!result.error) {
                return result;
            }
            if (!this.isAuthForeignKeyRace(result.error.details) || attempt === maxAttempts) {
                return result;
            }
            await delay(150 * attempt);
        }
        return {
            data: null,
            error: toServiceError('USER_CREATE_FAILED', 'Failed to create user profile.'),
        };
    }
    async createPendingSignup(input) {
        const expiresAt = new Date(Date.now() + PENDING_SIGNUP_EXPIRY_MINUTES * 60 * 1000).toISOString();
        await this.supabase
            .from('pending_signups')
            .delete()
            .eq('auth_user_id', input.auth_user_id);
        const { data, error } = await this.supabase
            .from('pending_signups')
            .insert({
            auth_user_id: input.auth_user_id,
            email: normalizeEmail(input.email),
            signup_type: input.signup_type,
            role: input.role,
            org_id: input.org_id ?? null,
            organization_payload: input.organization_payload ?? null,
            profile_payload: input.profile_payload,
            status: 'pending',
            expires_at: expiresAt,
        })
            .select('id, expires_at')
            .single();
        if (error || !data) {
            console.error('PENDING SIGNUP ERROR:', error);
            return {
                data: null,
                error: toServiceError('PENDING_SIGNUP_CREATE_FAILED', 'Failed to stage signup data for verification.', error),
            };
        }
        return {
            data: data,
            error: null,
        };
    }
    async cleanupSignupArtifacts(authUserId, email) {
        const normalizedEmail = normalizeEmail(email);
        await this.supabase
            .from('pending_signups')
            .delete()
            .eq('auth_user_id', authUserId);
        await this.supabase
            .from('email_verification_codes')
            .delete()
            .eq('auth_user_id', authUserId)
            .eq('email', normalizedEmail)
            .eq('is_used', false);
        await this.supabase.auth.admin.deleteUser(authUserId);
    }
    async notifyUserApproved(user, approvedBy) {
        if (this.notificationService) {
            await this.notificationService.createNotification({
                org_id: user.org_id,
                user_id: user.id,
                created_by_user_id: approvedBy.id,
                type: 'user.approved',
                title: 'Account approved',
                message: 'Your account has been approved. You can now access the platform.',
                data: {
                    approved_user_id: user.id,
                    approved_by_user_id: approvedBy.id,
                },
                priority: 'normal',
            });
            return;
        }
        await this.supabase.from('notifications').insert({
            org_id: user.org_id,
            user_id: user.id,
            created_by_user_id: approvedBy.id,
            type: 'user.approved',
            title: 'Account approved',
            message: 'Your account has been approved. You can now access the platform.',
            data: {
                approved_user_id: user.id,
                approved_by_user_id: approvedBy.id,
            },
            priority: 'normal',
        });
    }
    async adminSignup(input) {
        try {
            const parsed = AdminSignupSchema.parse({
                ...input,
                organization: {
                    ...input.organization,
                    code: normalizeCode(input.organization.code),
                },
            });
            const orgLookup = await this.organizationService.findOrganizationByCode(parsed.organization.code);
            if (orgLookup.error) {
                return {
                    data: null,
                    error: orgLookup.error,
                };
            }
            if (orgLookup.data) {
                return {
                    data: null,
                    error: toServiceError('ORG_CODE_EXISTS', 'Organization code is already in use.'),
                };
            }
            const authResult = await this.createSignupAuthUser({
                email: parsed.admin.email,
                password: parsed.admin.password,
                user_metadata: {
                    role: 'super_admin',
                    signup_source: 'self_signup_admin',
                    first_name: parsed.admin.first_name,
                    last_name: parsed.admin.last_name,
                    geographic_area: parsed.admin.geographic_area ?? null,
                },
            });
            if (authResult.error || !authResult.data) {
                return {
                    data: null,
                    error: authResult.error ?? toServiceError('AUTH_SIGNUP_FAILED', 'Failed to create admin auth account.'),
                };
            }
            const existingProfile = await this.getUserByAuthIdOptional(authResult.data.id);
            if (existingProfile.error) {
                return { data: null, error: existingProfile.error };
            }
            if (existingProfile.data) {
                return {
                    data: null,
                    error: toServiceError('ACCOUNT_ALREADY_EXISTS', 'A profile already exists for this email. Please sign in or complete verification.'),
                };
            }
            const pendingSignupResult = await this.createPendingSignup({
                auth_user_id: authResult.data.id,
                email: parsed.admin.email,
                signup_type: 'admin',
                role: 'super_admin',
                organization_payload: {
                    name: parsed.organization.name,
                    code: parsed.organization.code,
                    contact_email: parsed.organization.contact_email ?? null,
                    contact_phone: parsed.organization.contact_phone ?? null,
                    metadata: parsed.organization.metadata ?? {},
                },
                profile_payload: {
                    first_name: parsed.admin.first_name,
                    last_name: parsed.admin.last_name,
                    geographic_area: parsed.admin.geographic_area ?? null,
                },
            });
            if (pendingSignupResult.error) {
                await this.cleanupSignupArtifacts(authResult.data.id, parsed.admin.email);
                return {
                    data: null,
                    error: pendingSignupResult.error,
                };
            }
            // Send verification code email
            try {
                const verifyResult = await (0, send_verification_code_service_1.sendVerificationCode)({
                    email: parsed.admin.email,
                    authUserId: authResult.data.id,
                    firstName: parsed.admin.first_name,
                });
                if (!verifyResult.success) {
                    await this.cleanupSignupArtifacts(authResult.data.id, parsed.admin.email);
                    return {
                        data: null,
                        error: toServiceError('VERIFICATION_EMAIL_FAILED', 'Failed to send verification email. Please try signing up again.', verifyResult.message),
                    };
                }
            }
            catch (emailError) {
                await this.cleanupSignupArtifacts(authResult.data.id, parsed.admin.email);
                return {
                    data: null,
                    error: toServiceError('VERIFICATION_EMAIL_FAILED', 'Failed to send verification email. Please try signing up again.', emailError),
                };
            }
            return {
                data: {
                    auth_user_id: authResult.data.id,
                    pending_verification: true,
                },
                error: null,
            };
        }
        catch (error) {
            return {
                data: null,
                error: toServiceError('ADMIN_SIGNUP_VALIDATION_ERROR', 'Invalid admin signup payload.', error),
            };
        }
    }
    async staffSelfSignup(input) {
        try {
            const parsed = StaffSelfSignupSchema.parse({
                ...input,
                org_code: normalizeCode(input.org_code),
            });
            const orgValidation = await this.organizationService.validateOrganizationCode(parsed.org_code);
            if (orgValidation.error) {
                return { data: null, error: orgValidation.error };
            }
            if (!orgValidation.data?.valid || !orgValidation.data.organization) {
                return {
                    data: null,
                    error: toServiceError('ORG_NOT_FOUND', 'Invalid or inactive organization code.'),
                };
            }
            const organization = orgValidation.data.organization;
            const authResult = await this.createSignupAuthUser({
                email: parsed.email,
                password: parsed.password,
                user_metadata: {
                    org_id: organization.id,
                    role: 'staff',
                    signup_source: 'self_signup',
                    first_name: parsed.first_name,
                    last_name: parsed.last_name,
                    geographic_area: parsed.geographic_area ?? null,
                },
            });
            if (authResult.error || !authResult.data) {
                return {
                    data: null,
                    error: authResult.error ?? toServiceError('AUTH_SIGNUP_FAILED', 'Failed to create staff auth account.'),
                };
            }
            const existingProfile = await this.getUserByAuthIdOptional(authResult.data.id);
            if (existingProfile.error) {
                return { data: null, error: existingProfile.error };
            }
            if (existingProfile.data) {
                return {
                    data: null,
                    error: toServiceError('ACCOUNT_ALREADY_EXISTS', 'A profile already exists for this email. Please sign in or complete verification.'),
                };
            }
            const pendingSignupResult = await this.createPendingSignup({
                auth_user_id: authResult.data.id,
                email: parsed.email,
                signup_type: 'staff',
                role: 'staff',
                org_id: organization.id,
                profile_payload: {
                    first_name: parsed.first_name,
                    last_name: parsed.last_name,
                    geographic_area: parsed.geographic_area ?? null,
                },
            });
            if (pendingSignupResult.error) {
                await this.cleanupSignupArtifacts(authResult.data.id, parsed.email);
                return {
                    data: null,
                    error: pendingSignupResult.error,
                };
            }
            // Send verification code email
            try {
                const verifyResult = await (0, send_verification_code_service_1.sendVerificationCode)({
                    email: parsed.email,
                    authUserId: authResult.data.id,
                    firstName: parsed.first_name,
                });
                if (!verifyResult.success) {
                    await this.cleanupSignupArtifacts(authResult.data.id, parsed.email);
                    return {
                        data: null,
                        error: toServiceError('VERIFICATION_EMAIL_FAILED', 'Failed to send verification email. Please try signing up again.', verifyResult.message),
                    };
                }
            }
            catch (emailError) {
                await this.cleanupSignupArtifacts(authResult.data.id, parsed.email);
                return {
                    data: null,
                    error: toServiceError('VERIFICATION_EMAIL_FAILED', 'Failed to send verification email. Please try signing up again.', emailError),
                };
            }
            return {
                data: {
                    auth_user_id: authResult.data.id,
                    pending_verification: true,
                },
                error: null,
            };
        }
        catch (error) {
            return {
                data: null,
                error: toServiceError('STAFF_SIGNUP_VALIDATION_ERROR', 'Invalid staff signup payload.', error),
            };
        }
    }
    async donorSelfSignup(input) {
        try {
            const parsed = zod_1.z.object({
                email: zod_1.z.string().email(),
                password: zod_1.z.string().min(6).max(128),
                first_name: zod_1.z.string().trim().min(1),
                last_name: zod_1.z.string().trim().min(1),
                geographic_area: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional().nullable(),
            }).parse(input);
            const authResult = await this.createSignupAuthUser({
                email: parsed.email,
                password: parsed.password,
                user_metadata: {
                    role: 'donor',
                    signup_source: 'donor_signup',
                    first_name: parsed.first_name,
                    last_name: parsed.last_name,
                    geographic_area: parsed.geographic_area ?? null,
                },
            });
            if (authResult.error || !authResult.data) {
                return {
                    data: null,
                    error: authResult.error ?? toServiceError('AUTH_SIGNUP_FAILED', 'Failed to create donor auth account.'),
                };
            }
            const existingProfile = await this.getUserByAuthIdOptional(authResult.data.id);
            if (existingProfile.error)
                return { data: null, error: existingProfile.error };
            if (existingProfile.data) {
                return { data: null, error: toServiceError('ACCOUNT_ALREADY_EXISTS', 'Account exists.') };
            }
            const { data: defaultOrgs, error: defaultOrgError } = await this.supabase
                .from('organizations')
                .select('id')
                .eq('is_active', true)
                .limit(1);
            const defaultOrgId = defaultOrgs?.[0]?.id;
            if (!defaultOrgId) {
                return { data: null, error: toServiceError('ORG_MISSING', 'System error: No active organization available for donor assignment.') };
            }
            const pendingSignupResult = await this.createPendingSignup({
                auth_user_id: authResult.data.id,
                email: parsed.email,
                signup_type: 'donor',
                role: 'donor',
                org_id: defaultOrgId,
                profile_payload: {
                    first_name: parsed.first_name,
                    last_name: parsed.last_name,
                    geographic_area: parsed.geographic_area ?? null,
                    is_active: true, // Donors don't need manual approval like staff
                    role: { type: 'donor', permissions: [] }
                },
            });
            if (pendingSignupResult.error) {
                await this.cleanupSignupArtifacts(authResult.data.id, parsed.email);
                return { data: null, error: pendingSignupResult.error };
            }
            try {
                const verifyResult = await (0, send_verification_code_service_1.sendVerificationCode)({
                    email: parsed.email,
                    authUserId: authResult.data.id,
                    firstName: parsed.first_name,
                });
                if (!verifyResult.success) {
                    await this.cleanupSignupArtifacts(authResult.data.id, parsed.email);
                    return { data: null, error: toServiceError('VERIFICATION_EMAIL_FAILED', 'Failed.') };
                }
            }
            catch (emailError) {
                await this.cleanupSignupArtifacts(authResult.data.id, parsed.email);
                return { data: null, error: toServiceError('VERIFICATION_EMAIL_FAILED', 'Failed to send email.') };
            }
            return {
                data: { auth_user_id: authResult.data.id, pending_verification: true },
                error: null,
            };
        }
        catch (error) {
            return { data: null, error: toServiceError('DONOR_SIGNUP_VALIDATION_ERROR', 'Invalid payload', error) };
        }
    }
    async adminCreateStaff(input) {
        try {
            const parsed = AdminCreateStaffSchema.parse(input);
            const requesterResult = await this.getUserByAuthId(parsed.requester_auth_id);
            if (requesterResult.error || !requesterResult.data) {
                return {
                    data: null,
                    error: requesterResult.error ?? toServiceError('REQUESTER_NOT_FOUND', 'Requester not found.'),
                };
            }
            const requester = requesterResult.data;
            if (requester.org_id !== parsed.org_id) {
                return {
                    data: null,
                    error: toServiceError('FORBIDDEN', 'Requester cannot create staff for another organization.'),
                };
            }
            const isAllowedCreator = ['admin', 'super_admin'].includes(requester.role.type);
            if (!isAllowedCreator || !requester.is_active) {
                return {
                    data: null,
                    error: toServiceError('FORBIDDEN', 'Only active admin or super_admin can create staff users.'),
                };
            }
            if (parsed.role.type === 'super_admin') {
                return {
                    data: null,
                    error: toServiceError('INVALID_ROLE', 'Admin staff creation cannot create another super_admin.'),
                };
            }
            let authUserId = '';
            if (parsed.send_invite_email) {
                const inviteResult = await this.supabase.auth.admin.inviteUserByEmail(parsed.email.toLowerCase(), {
                    data: {
                        org_id: parsed.org_id,
                        role: parsed.role.type,
                        signup_source: 'admin_create_staff',
                    },
                    redirectTo: 'https://app.example.com/auth/callback',
                });
                if (inviteResult.error || !inviteResult.data.user) {
                    return {
                        data: null,
                        error: toServiceError('AUTH_INVITE_FAILED', 'Failed to invite staff auth account.', inviteResult.error),
                    };
                }
                authUserId = inviteResult.data.user.id;
            }
            else {
                const createResult = await this.supabase.auth.admin.createUser({
                    email: parsed.email.toLowerCase(),
                    password: parsed.temporary_password,
                    email_confirm: true,
                    user_metadata: {
                        org_id: parsed.org_id,
                        role: parsed.role.type,
                        signup_source: 'admin_create_staff',
                    },
                });
                if (createResult.error || !createResult.data.user) {
                    return {
                        data: null,
                        error: toServiceError('AUTH_CREATE_FAILED', 'Failed to create staff auth account.', createResult.error),
                    };
                }
                authUserId = createResult.data.user.id;
            }
            const profileResult = await this.createUserProfileWithRetry({
                org_id: parsed.org_id,
                auth_id: authUserId,
                email: parsed.email,
                first_name: parsed.first_name,
                last_name: parsed.last_name,
                role: parsed.role,
                geographic_area: parsed.geographic_area,
                is_active: true,
            });
            if (profileResult.error || !profileResult.data) {
                return {
                    data: null,
                    error: profileResult.error ?? toServiceError('USER_CREATE_FAILED', 'Failed to create staff profile.'),
                };
            }
            return {
                data: {
                    user: profileResult.data,
                    auth_user_id: authUserId,
                },
                error: null,
            };
        }
        catch (error) {
            return {
                data: null,
                error: toServiceError('ADMIN_CREATE_STAFF_VALIDATION_ERROR', 'Invalid admin staff payload.', error),
            };
        }
    }
    async approvePendingUser(input) {
        try {
            const parsed = ApproveUserSchema.parse(input);
            const requesterResult = await this.getUserByAuthId(parsed.requester_auth_id);
            if (requesterResult.error || !requesterResult.data) {
                return {
                    data: null,
                    error: requesterResult.error ?? toServiceError('REQUESTER_NOT_FOUND', 'Requester not found.'),
                };
            }
            const requester = requesterResult.data;
            if (requester.role.type !== 'super_admin' || !requester.is_active) {
                return {
                    data: null,
                    error: toServiceError('FORBIDDEN', 'Only active super_admin can approve users.'),
                };
            }
            const { data: targetData, error: targetError } = await this.supabase
                .from('users')
                .select('*')
                .eq('id', parsed.user_id)
                .single();
            if (targetError || !targetData) {
                return {
                    data: null,
                    error: toServiceError('USER_NOT_FOUND', 'Target user not found.', targetError),
                };
            }
            const target = targetData;
            if (target.org_id !== requester.org_id) {
                return {
                    data: null,
                    error: toServiceError('FORBIDDEN', 'Cannot approve user from another organization.'),
                };
            }
            if (target.is_active) {
                return {
                    data: target,
                    error: null,
                };
            }
            const approvedRole = parsed.role_type
                ? buildRoleByType(parsed.role_type)
                : buildViewerRole();
            const nextGeographicArea = target.geographic_area && typeof target.geographic_area === 'object' && !Array.isArray(target.geographic_area)
                ? { ...target.geographic_area }
                : {};
            nextGeographicArea.sector = parsed.sector ?? 'none';
            const { data: updated, error: updateError } = await this.supabase
                .from('users')
                .update({
                is_active: true,
                role: approvedRole,
                geographic_area: nextGeographicArea,
            })
                .eq('id', target.id)
                .select('*')
                .single();
            if (updateError || !updated) {
                return {
                    data: null,
                    error: toServiceError('USER_APPROVE_FAILED', 'Failed to approve pending user.', updateError),
                };
            }
            await this.notifyUserApproved(updated, requester);
            return { data: updated, error: null };
        }
        catch (error) {
            return {
                data: null,
                error: toServiceError('USER_APPROVE_VALIDATION_ERROR', 'Invalid approval payload.', error),
            };
        }
    }
}
exports.UserService = UserService;
