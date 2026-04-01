"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvitesService = void 0;
const crypto_1 = require("crypto");
const zod_1 = require("zod");
const InviteCreateSchema = zod_1.z.object({
    org_id: zod_1.z.string().uuid(),
    email: zod_1.z.string().email(),
    role: zod_1.z.object({
        type: zod_1.z.string().min(1),
        permissions: zod_1.z.array(zod_1.z.string()).default([]),
    }),
    geographic_area: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional().nullable(),
    expires_in_hours: zod_1.z.number().int().min(1).max(720).optional(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
const InviteConsumeSchema = zod_1.z.object({
    token: zod_1.z.string().min(20),
    password: zod_1.z.string().min(8).max(128),
    first_name: zod_1.z.string().trim().min(1),
    last_name: zod_1.z.string().trim().min(1),
});
function toServiceError(code, message, details) {
    return { code, message, details };
}
function hashToken(token) {
    return (0, crypto_1.createHash)('sha256').update(token).digest('hex');
}
function generateToken() {
    return (0, crypto_1.randomBytes)(32).toString('hex');
}
class InvitesService {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
    }
    async getRequesterByAuthId(authId) {
        const { data, error } = await this.supabase
            .from('users')
            .select('*')
            .eq('auth_id', authId)
            .single();
        if (error) {
            return {
                data: null,
                error: toServiceError('REQUESTER_LOOKUP_FAILED', 'Failed to resolve requester.', error),
            };
        }
        return { data: data, error: null };
    }
    async createInvite(requesterAuthId, input) {
        try {
            const parsed = InviteCreateSchema.parse(input);
            const requesterResult = await this.getRequesterByAuthId(requesterAuthId);
            if (requesterResult.error) {
                return { data: null, error: requesterResult.error };
            }
            const requester = requesterResult.data;
            if (!requester || requester.org_id !== parsed.org_id) {
                return {
                    data: null,
                    error: toServiceError('FORBIDDEN', 'Requester does not belong to the target organization.'),
                };
            }
            if (requester.role.type !== 'super_admin' || !requester.is_active) {
                return {
                    data: null,
                    error: toServiceError('FORBIDDEN', 'Only active super_admin can create invites.'),
                };
            }
            if (parsed.role.type === 'super_admin') {
                return {
                    data: null,
                    error: toServiceError('INVALID_ROLE', 'Invite flow cannot create another super_admin.'),
                };
            }
            const token = generateToken();
            const tokenHash = hashToken(token);
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + (parsed.expires_in_hours ?? 72));
            const { data, error } = await this.supabase
                .from('invites')
                .insert({
                org_id: parsed.org_id,
                email: parsed.email.toLowerCase(),
                role: parsed.role,
                geographic_area: parsed.geographic_area ?? null,
                token_hash: tokenHash,
                expires_at: expiresAt.toISOString(),
                used_at: null,
                used_by_auth_id: null,
                created_by_user_id: requester.id,
                metadata: {
                    pre_approved: true,
                    ...(parsed.metadata ?? {}),
                },
            })
                .select('*')
                .single();
            if (error) {
                return {
                    data: null,
                    error: toServiceError('INVITE_CREATE_FAILED', 'Failed to create invite.', error),
                };
            }
            const inviteUrl = `https://app.example.com/invite/accept?token=${token}`;
            return {
                data: {
                    invite: data,
                    token,
                    invite_url: inviteUrl,
                },
                error: null,
            };
        }
        catch (error) {
            return {
                data: null,
                error: toServiceError('INVITE_CREATE_VALIDATION_ERROR', 'Invalid invite payload.', error),
            };
        }
    }
    async consumeInviteAndSignup(input) {
        try {
            const parsed = InviteConsumeSchema.parse(input);
            const tokenHash = hashToken(parsed.token);
            const { data: inviteData, error: inviteError } = await this.supabase
                .from('invites')
                .select('*')
                .eq('token_hash', tokenHash)
                .is('used_at', null)
                .single();
            if (inviteError || !inviteData) {
                return {
                    data: null,
                    error: toServiceError('INVITE_INVALID', 'Invite token is invalid or already used.', inviteError),
                };
            }
            const invite = inviteData;
            if (new Date(invite.expires_at).getTime() < Date.now()) {
                return {
                    data: null,
                    error: toServiceError('INVITE_EXPIRED', 'Invite token has expired.'),
                };
            }
            const signUpResult = await this.supabase.auth.signUp({
                email: invite.email,
                password: parsed.password,
                options: {
                    emailRedirectTo: 'https://app.example.com/auth/callback',
                    data: {
                        org_id: invite.org_id,
                        signup_source: 'invite_portal',
                    },
                },
            });
            if (signUpResult.error || !signUpResult.data.user) {
                return {
                    data: null,
                    error: toServiceError('AUTH_SIGNUP_FAILED', 'Failed to create auth account from invite.', signUpResult.error),
                };
            }
            const authUser = signUpResult.data.user;
            const { data: userData, error: userError } = await this.supabase
                .from('users')
                .insert({
                org_id: invite.org_id,
                auth_id: authUser.id,
                email: invite.email,
                first_name: parsed.first_name,
                last_name: parsed.last_name,
                role: invite.role,
                geographic_area: invite.geographic_area,
                is_active: true,
            })
                .select('*')
                .single();
            if (userError || !userData) {
                return {
                    data: null,
                    error: toServiceError('USER_CREATE_FAILED', 'Failed to create user profile from invite.', userError),
                };
            }
            const { error: consumeError } = await this.supabase
                .from('invites')
                .update({
                used_at: new Date().toISOString(),
                used_by_auth_id: authUser.id,
            })
                .eq('id', invite.id)
                .is('used_at', null);
            if (consumeError) {
                return {
                    data: null,
                    error: toServiceError('INVITE_CONSUME_FAILED', 'Failed to mark invite as consumed.', consumeError),
                };
            }
            return {
                data: {
                    user: userData,
                    invite,
                },
                error: null,
            };
        }
        catch (error) {
            return {
                data: null,
                error: toServiceError('INVITE_CONSUME_VALIDATION_ERROR', 'Invalid invite consume payload.', error),
            };
        }
    }
}
exports.InvitesService = InvitesService;
