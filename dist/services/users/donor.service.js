"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DonorService = void 0;
const zod_1 = require("zod");
const send_verification_code_service_1 = require("../auth/send-verification-code.service");
const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const DonorSignupSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8).max(128),
    first_name: zod_1.z.string().trim().min(1),
    last_name: zod_1.z.string().trim().min(1),
    blood_type: zod_1.z.enum(BLOOD_TYPES).optional(),
    phone_number: zod_1.z.string().trim().min(7).max(32).optional(),
    province: zod_1.z.string().trim().min(1).max(80).optional(),
    city: zod_1.z.string().trim().min(1).max(80).optional(),
    org_code: zod_1.z.string().trim().min(3).max(32).optional(),
});
const DonorProfileUpdateSchema = zod_1.z.object({
    first_name: zod_1.z.string().trim().min(1).optional(),
    last_name: zod_1.z.string().trim().min(1).optional(),
    phone_number: zod_1.z.string().trim().min(7).max(32).optional(),
    blood_type: zod_1.z.enum(BLOOD_TYPES).optional(),
    province: zod_1.z.string().trim().min(1).max(80).optional(),
    city: zod_1.z.string().trim().min(1).max(80).optional(),
    health_info: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
function toServiceError(code, message, details) {
    return { code, message, details };
}
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function normalizeCode(code) {
    return code.trim().toUpperCase();
}
function isAllowedDonorEvent(event) {
    if (event.is_public) {
        return true;
    }
    if (!event.extra_data || typeof event.extra_data !== 'object' || Array.isArray(event.extra_data)) {
        return false;
    }
    const allow = event.extra_data.allow_donor_signup;
    return allow === true || allow === 'true';
}
function extraString(extra, key) {
    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
        return null;
    }
    const value = extra[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
        return null;
    }
    return value.trim();
}
function extraNumber(extra, key) {
    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
        return 0;
    }
    const value = extra[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.round(value));
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return Math.max(0, Math.round(parsed));
        }
    }
    return 0;
}
class DonorService {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
    }
    async findSingleUserByEmail(email) {
        const usersTable = this.supabase.from('users');
        const normalized = normalizeEmail(email);
        const { data, error } = await usersTable
            .select('id, auth_id, email, first_name, last_name, role')
            .ilike('email', normalized)
            .limit(2);
        if (error) {
            return {
                data: null,
                error: toServiceError('USER_LOOKUP_FAILED', 'Failed to check existing account by email.', error),
            };
        }
        const rows = (data ?? []);
        if (rows.length === 0) {
            return { data: null, error: null };
        }
        if (rows.length > 1) {
            return {
                data: null,
                error: toServiceError('EMAIL_CONFLICT', 'Multiple accounts were found for this email. Please sign in first and complete donor enrollment from your session.'),
            };
        }
        return { data: rows[0], error: null };
    }
    async hasDonorProfile(userId) {
        const donorProfilesTable = this.supabase.from('donor_profiles');
        const { data, error } = await donorProfilesTable
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();
        if (error) {
            return {
                data: null,
                error: toServiceError('DONOR_PROFILE_LOOKUP_FAILED', 'Failed to verify donor profile status.', error),
            };
        }
        return { data: Boolean(data?.id), error: null };
    }
    async isDonorEnabledForUser(userId) {
        const usersTable = this.supabase.from('users');
        const { data: user, error: userError } = await usersTable
            .select('id, role')
            .eq('id', userId)
            .single();
        if (userError || !user) {
            return {
                data: null,
                error: toServiceError('DONOR_NOT_FOUND', 'Donor account was not found.', userError),
            };
        }
        if (String(user.role?.type ?? '').toLowerCase() === 'donor') {
            return { data: true, error: null };
        }
        const donorProfileState = await this.hasDonorProfile(userId);
        if (donorProfileState.error || donorProfileState.data == null) {
            return { data: null, error: donorProfileState.error };
        }
        return { data: donorProfileState.data, error: null };
    }
    async activateDonorAccount(input) {
        const usersTable = this.supabase.from('users');
        const donorProfilesTable = this.supabase.from('donor_profiles');
        const { data: userRow, error: userError } = await usersTable
            .select('id, first_name, last_name')
            .eq('id', input.user_id)
            .single();
        if (userError || !userRow?.id) {
            return {
                data: null,
                error: toServiceError('DONOR_NOT_FOUND', 'User account was not found.', userError),
            };
        }
        const namePatch = {};
        if (input.first_name && input.first_name.trim().length > 0) {
            namePatch.first_name = input.first_name.trim();
        }
        if (input.last_name && input.last_name.trim().length > 0) {
            namePatch.last_name = input.last_name.trim();
        }
        if (Object.keys(namePatch).length > 0) {
            const { error: updateError } = await usersTable.update(namePatch).eq('id', input.user_id);
            if (updateError) {
                return {
                    data: null,
                    error: toServiceError('DONOR_USER_UPDATE_FAILED', 'Failed to update account details.', updateError),
                };
            }
        }
        const profilePatch = {
            user_id: input.user_id,
            blood_type: input.blood_type ?? null,
            phone_number: input.phone_number ?? null,
            province: input.province ?? null,
            city: input.city ?? null,
            health_info: {},
        };
        const { error: upsertError } = await donorProfilesTable.upsert(profilePatch, { onConflict: 'user_id' });
        if (upsertError) {
            return {
                data: null,
                error: toServiceError('DONOR_PROFILE_CREATE_FAILED', 'Failed to activate donor profile.', upsertError),
            };
        }
        return { data: { activated: true }, error: null };
    }
    async resolveDonorOrganization(orgCode) {
        const organizationsTable = this.supabase.from('organizations');
        const preferredCode = orgCode || process.env.DEFAULT_DONOR_ORG_CODE || '';
        if (preferredCode.trim().length === 0) {
            return {
                data: null,
                error: toServiceError('ORG_CODE_REQUIRED', 'An organization code (org_code) is required for donor signup.'),
            };
        }
        const normalized = normalizeCode(preferredCode);
        const { data, error } = await organizationsTable
            .select('id, code, is_active')
            .ilike('code', normalized)
            .maybeSingle();
        if (error) {
            return {
                data: null,
                error: toServiceError('ORG_LOOKUP_FAILED', 'Failed to resolve donor organization.', error),
            };
        }
        if (!data || data.is_active !== true) {
            return {
                data: null,
                error: toServiceError('ORG_NOT_FOUND', 'No active organization found for the provided org code.'),
            };
        }
        return {
            data: { id: String(data.id), code: String(data.code) },
            error: null,
        };
    }
    async getUserByAuthIdOptional(authId) {
        const usersTable = this.supabase.from('users');
        const { data, error } = await usersTable
            .select('id, auth_id')
            .eq('auth_id', authId)
            .maybeSingle();
        if (error) {
            return {
                data: null,
                error: toServiceError('USER_LOOKUP_FAILED', 'Failed to check existing user profile.', error),
            };
        }
        if (!data) {
            return { data: null, error: null };
        }
        return {
            data: {
                id: String(data.id),
                auth_id: String(data.auth_id),
            },
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
        const maybeCode = createResult.error?.code;
        if (maybeCode === 'email_exists') {
            const listResult = await this.supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
            if (listResult.error) {
                return {
                    data: null,
                    error: toServiceError('AUTH_LIST_USERS_FAILED', 'Failed to resolve existing account.', listResult.error),
                };
            }
            const existing = (listResult.data?.users ?? []).find((row) => typeof row.email === 'string' && row.email.toLowerCase() === normalizeEmail(input.email));
            if (!existing?.id) {
                return {
                    data: null,
                    error: toServiceError('EMAIL_EXISTS', 'An account already exists for this email.'),
                };
            }
            const existingProfile = await this.getUserByAuthIdOptional(existing.id);
            if (existingProfile.error) {
                return { data: null, error: existingProfile.error };
            }
            if (existingProfile.data?.id) {
                return {
                    data: null,
                    error: toServiceError('EMAIL_EXISTS', 'An account already exists for this email.'),
                };
            }
            const updateResult = await this.supabase.auth.admin.updateUserById(existing.id, {
                password: input.password,
                user_metadata: {
                    ...(input.user_metadata ?? {}),
                    resumed_signup: true,
                },
            });
            if (updateResult.error) {
                return {
                    data: null,
                    error: toServiceError('AUTH_SIGNUP_RESUME_FAILED', 'Failed to resume existing account setup.', updateResult.error),
                };
            }
            return {
                data: { id: existing.id },
                error: null,
            };
        }
        return {
            data: null,
            error: toServiceError('AUTH_SIGNUP_FAILED', 'Failed to create donor auth account.', createResult.error),
        };
    }
    async cleanupSignupArtifacts(authUserId, email) {
        const normalizedEmail = normalizeEmail(email);
        const pendingTable = this.supabase.from('pending_signups');
        const codesTable = this.supabase.from('email_verification_codes');
        await pendingTable.delete().eq('auth_user_id', authUserId);
        await codesTable
            .delete()
            .eq('auth_user_id', authUserId)
            .eq('email', normalizedEmail)
            .eq('is_used', false);
        await this.supabase.auth.admin.deleteUser(authUserId);
    }
    async donorSignup(input) {
        try {
            const parsed = DonorSignupSchema.parse(input);
            const orgResult = await this.resolveDonorOrganization(parsed.org_code);
            if (orgResult.error || !orgResult.data) {
                return { data: null, error: orgResult.error };
            }
            const existingUser = await this.findSingleUserByEmail(parsed.email);
            if (existingUser.error) {
                return { data: null, error: existingUser.error };
            }
            if (existingUser.data?.id && existingUser.data.auth_id) {
                const activateExisting = await this.activateDonorAccount({
                    user_id: existingUser.data.id,
                    first_name: parsed.first_name,
                    last_name: parsed.last_name,
                    blood_type: parsed.blood_type,
                    phone_number: parsed.phone_number,
                    province: parsed.province,
                    city: parsed.city,
                });
                if (activateExisting.error) {
                    return { data: null, error: activateExisting.error };
                }
                return {
                    data: {
                        auth_user_id: existingUser.data.auth_id,
                        pending_verification: false,
                    },
                    error: null,
                };
            }
            const authResult = await this.createSignupAuthUser({
                email: parsed.email,
                password: parsed.password,
                user_metadata: {
                    role: 'donor',
                    signup_source: 'donor_self_signup',
                    first_name: parsed.first_name,
                    last_name: parsed.last_name,
                    blood_type: parsed.blood_type,
                    phone_number: parsed.phone_number ?? null,
                    geographic_area: {
                        province: parsed.province ?? null,
                        city: parsed.city ?? null,
                    },
                },
            });
            if (authResult.error || !authResult.data) {
                return { data: null, error: authResult.error };
            }
            const existingProfile = await this.getUserByAuthIdOptional(authResult.data.id);
            if (existingProfile.error) {
                return { data: null, error: existingProfile.error };
            }
            if (existingProfile.data?.id) {
                return {
                    data: null,
                    error: toServiceError('ACCOUNT_ALREADY_EXISTS', 'A profile already exists for this email.'),
                };
            }
            const pendingTable = this.supabase.from('pending_signups');
            await pendingTable.delete().eq('auth_user_id', authResult.data.id);
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
            const { error: pendingError } = await pendingTable.insert({
                auth_user_id: authResult.data.id,
                email: normalizeEmail(parsed.email),
                signup_type: 'donor',
                role: 'donor',
                org_id: orgResult.data.id,
                organization_payload: null,
                profile_payload: {
                    first_name: parsed.first_name,
                    last_name: parsed.last_name,
                    blood_type: parsed.blood_type,
                    phone_number: parsed.phone_number ?? null,
                    province: parsed.province ?? null,
                    city: parsed.city ?? null,
                    geographic_area: {
                        province: parsed.province ?? null,
                        city: parsed.city ?? null,
                    },
                    health_info: {},
                },
                status: 'pending',
                expires_at: expiresAt,
            });
            if (pendingError) {
                await this.cleanupSignupArtifacts(authResult.data.id, parsed.email);
                return {
                    data: null,
                    error: toServiceError('PENDING_SIGNUP_CREATE_FAILED', 'Failed to stage donor signup.', pendingError),
                };
            }
            const verificationResult = await (0, send_verification_code_service_1.sendVerificationCode)({
                email: parsed.email,
                authUserId: authResult.data.id,
                firstName: parsed.first_name,
            });
            if (!verificationResult.success) {
                await this.cleanupSignupArtifacts(authResult.data.id, parsed.email);
                return {
                    data: null,
                    error: toServiceError('VERIFICATION_EMAIL_FAILED', verificationResult.message),
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
                error: toServiceError('DONOR_SIGNUP_VALIDATION_ERROR', 'Invalid donor signup payload.', error),
            };
        }
    }
    async getDonorDashboard(userId) {
        const usersTable = this.supabase.from('users');
        const donorProfilesTable = this.supabase.from('donor_profiles');
        const participantsTable = this.supabase.from('event_participants');
        const eventsTable = this.supabase.from('events');
        const { data: userRow, error: userError } = await usersTable
            .select('id, email, first_name, last_name, role')
            .eq('id', userId)
            .single();
        if (userError || !userRow) {
            return {
                data: null,
                error: toServiceError('DONOR_NOT_FOUND', 'Donor account was not found.', userError),
            };
        }
        const donorEnabled = await this.isDonorEnabledForUser(userId);
        if (donorEnabled.error || donorEnabled.data == null) {
            return { data: null, error: donorEnabled.error };
        }
        if (!donorEnabled.data) {
            return {
                data: null,
                error: toServiceError('DONOR_ACCESS_REQUIRED', 'Donor account setup is required for this view.'),
            };
        }
        const { data: donorProfile } = await donorProfilesTable
            .select('blood_type, phone_number, province, city, total_donations, total_bags_donated')
            .eq('user_id', userId)
            .maybeSingle();
        const { data: participantRows, error: participantError } = await participantsTable
            .select('id, event_id, status, applied_at, donated_at, bags_donated, certificate_url')
            .eq('participant_type', 'donor')
            .eq('participant_donor_id', userId)
            .order('applied_at', { ascending: false });
        if (participantError) {
            return {
                data: null,
                error: toServiceError('DONATION_HISTORY_FETCH_FAILED', 'Failed to load donor participation history.', participantError),
            };
        }
        const rows = (participantRows ?? []);
        const eventIds = Array.from(new Set(rows.map((row) => String(row.event_id)).filter(Boolean)));
        let eventsById = new Map();
        if (eventIds.length > 0) {
            const { data: eventsRows, error: eventsError } = await eventsTable
                .select('id, title, event_date, start_time, end_time, address, extra_data')
                .in('id', eventIds);
            if (eventsError) {
                return {
                    data: null,
                    error: toServiceError('DONOR_EVENTS_FETCH_FAILED', 'Failed to load donor events.', eventsError),
                };
            }
            eventsById = new Map((eventsRows ?? []).map((event) => [String(event.id), event]));
        }
        const todayIso = new Date().toISOString().slice(0, 10);
        const allEventViews = rows
            .map((row) => {
            const event = eventsById.get(String(row.event_id));
            if (!event) {
                return null;
            }
            return {
                participant_id: String(row.id),
                event_id: String(row.event_id),
                title: String(event.title ?? 'Untitled Event'),
                event_date: String(event.event_date ?? ''),
                start_time: String(event.start_time ?? ''),
                end_time: String(event.end_time ?? ''),
                address: String(event.address ?? ''),
                status: String(row.status ?? 'applied'),
                bags_donated: Number(row.bags_donated ?? (row.status === 'donated' ? 1 : 0)) || 0,
                certificate_url: typeof row.certificate_url === 'string' ? row.certificate_url : null,
            };
        })
            .filter((item) => Boolean(item));
        const upcoming = allEventViews.filter((item) => item.event_date >= todayIso && !['donated', 'no_show'].includes(item.status));
        const past = allEventViews.filter((item) => item.event_date < todayIso || ['donated', 'no_show'].includes(item.status));
        const donationHistory = allEventViews.filter((item) => ['participated', 'donated'].includes(item.status));
        const computedDonations = donationHistory.length;
        const computedBags = donationHistory.reduce((sum, item) => sum + Math.max(0, item.bags_donated), 0);
        const totalDonations = Number(donorProfile?.total_donations ?? computedDonations) || computedDonations;
        const totalBags = Number(donorProfile?.total_bags_donated ?? computedBags) || computedBags;
        const livesImpact = totalBags * 3;
        const donatedDates = donationHistory
            .map((item) => item.event_date)
            .filter((value) => typeof value === 'string' && value.length > 0)
            .sort((a, b) => (a > b ? -1 : 1));
        const achievements = [
            {
                key: 'first_time',
                title: 'First Time Donor',
                unlocked: totalDonations >= 1,
                description: 'Completed your first successful donation.',
            },
            {
                key: 'regular',
                title: 'Regular Donor',
                unlocked: totalDonations >= 5,
                description: 'Reached 5 or more successful donations.',
            },
            {
                key: 'hero',
                title: 'Hero Donor',
                unlocked: totalDonations >= 10,
                description: 'Reached 10 or more successful donations.',
            },
            {
                key: 'life_saver',
                title: 'Life Saver',
                unlocked: totalBags >= 50,
                description: 'Contributed 50 or more total blood bags.',
            },
        ];
        return {
            data: {
                welcome: {
                    first_name: String(userRow.first_name ?? 'Donor'),
                    total_donations: totalDonations,
                    total_bags_donated: totalBags,
                    lives_impact: livesImpact,
                },
                profile: {
                    user_id: String(userRow.id),
                    email: String(userRow.email),
                    first_name: String(userRow.first_name ?? ''),
                    last_name: String(userRow.last_name ?? ''),
                    blood_type: donorProfile?.blood_type ? String(donorProfile.blood_type) : null,
                    phone_number: donorProfile?.phone_number ? String(donorProfile.phone_number) : null,
                    province: donorProfile?.province ? String(donorProfile.province) : null,
                    city: donorProfile?.city ? String(donorProfile.city) : null,
                    total_donations: totalDonations,
                    total_bags_donated: totalBags,
                    last_donation_date: donatedDates[0] ?? null,
                },
                my_events: {
                    upcoming,
                    past,
                },
                donation_history: donationHistory,
                achievements,
            },
            error: null,
        };
    }
    async getDonorProfile(userId) {
        const dashboard = await this.getDonorDashboard(userId);
        if (dashboard.error || !dashboard.data) {
            return { data: null, error: dashboard.error };
        }
        return { data: dashboard.data.profile, error: null };
    }
    async updateDonorProfile(userId, input) {
        try {
            const parsed = DonorProfileUpdateSchema.parse(input);
            const usersTable = this.supabase.from('users');
            const donorProfilesTable = this.supabase.from('donor_profiles');
            const donorEnabled = await this.isDonorEnabledForUser(userId);
            if (donorEnabled.error || donorEnabled.data == null) {
                return { data: null, error: donorEnabled.error };
            }
            if (!donorEnabled.data) {
                return {
                    data: null,
                    error: toServiceError('DONOR_ACCESS_REQUIRED', 'Donor account setup is required to update this profile.'),
                };
            }
            const userPatch = {};
            if (parsed.first_name) {
                userPatch.first_name = parsed.first_name;
            }
            if (parsed.last_name) {
                userPatch.last_name = parsed.last_name;
            }
            if (Object.keys(userPatch).length > 0) {
                const { error: patchUserError } = await usersTable.update(userPatch).eq('id', userId);
                if (patchUserError) {
                    return {
                        data: null,
                        error: toServiceError('DONOR_USER_UPDATE_FAILED', 'Failed to update donor account name.', patchUserError),
                    };
                }
            }
            const donorPatch = {};
            if (parsed.phone_number !== undefined) {
                donorPatch.phone_number = parsed.phone_number;
            }
            if (parsed.blood_type !== undefined) {
                donorPatch.blood_type = parsed.blood_type;
            }
            if (parsed.province !== undefined) {
                donorPatch.province = parsed.province;
            }
            if (parsed.city !== undefined) {
                donorPatch.city = parsed.city;
            }
            if (parsed.health_info !== undefined) {
                donorPatch.health_info = parsed.health_info;
            }
            if (Object.keys(donorPatch).length > 0) {
                const { error: upsertError } = await donorProfilesTable.upsert({
                    user_id: userId,
                    ...donorPatch,
                }, { onConflict: 'user_id' });
                if (upsertError) {
                    return {
                        data: null,
                        error: toServiceError('DONOR_PROFILE_UPDATE_FAILED', 'Failed to update donor profile.', upsertError),
                    };
                }
            }
            return this.getDonorProfile(userId);
        }
        catch (error) {
            return {
                data: null,
                error: toServiceError('DONOR_PROFILE_VALIDATION_ERROR', 'Invalid donor profile payload.', error),
            };
        }
    }
    async listPublicEvents(params) {
        const eventsTable = this.supabase.from('events');
        const participantsTable = this.supabase.from('event_participants');
        const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
        const offset = Math.max(params.offset ?? 0, 0);
        let query = eventsTable
            .select('id, title, type, event_date, start_time, end_time, address, is_public, visibility, setup_status, extra_data, latitude, longitude, map_location_label, map_address')
            .eq('status', 'published')
            .eq('setup_status', 'complete')
            .or('visibility.eq.public,is_public.eq.true')
            .order('event_date', { ascending: true })
            .order('start_time', { ascending: true })
            .range(offset, offset + limit - 1);
        if (params.from_date) {
            query = query.gte('event_date', params.from_date);
        }
        if (params.to_date) {
            query = query.lte('event_date', params.to_date);
        }
        if (params.type) {
            query = query.eq('type', params.type);
        }
        const { data, error } = await query;
        if (error) {
            return {
                data: null,
                error: toServiceError('PUBLIC_DONOR_EVENTS_FETCH_FAILED', 'Failed to load public donor events.', error),
            };
        }
        let rows = (data ?? [])
            .filter((event) => isAllowedDonorEvent(event));
        if (params.province) {
            const q = params.province.trim().toLowerCase();
            rows = rows.filter((event) => (extraString(event.extra_data, 'province') ?? '').toLowerCase() === q);
        }
        if (params.city) {
            const q = params.city.trim().toLowerCase();
            rows = rows.filter((event) => {
                const city = extraString(event.extra_data, 'city')
                    ?? extraString(event.extra_data, 'municipality')
                    ?? extraString(event.extra_data, 'location')
                    ?? '';
                return city.toLowerCase() === q;
            });
        }
        const eventIds = rows.map((row) => String(row.id));
        const participantRows = eventIds.length > 0
            ? await participantsTable.select('event_id').in('event_id', eventIds)
            : { data: [], error: null };
        if (participantRows.error) {
            return {
                data: null,
                error: toServiceError('PUBLIC_DONOR_EVENTS_PARTICIPANTS_FAILED', 'Failed to compute participant counts.', participantRows.error),
            };
        }
        const participantsByEvent = new Map();
        for (const row of (participantRows.data ?? [])) {
            participantsByEvent.set(row.event_id, (participantsByEvent.get(row.event_id) ?? 0) + 1);
        }
        const mapped = rows.map((event) => {
            const extra = event.extra_data;
            const maxSpots = extraNumber(extra, 'max_participants') || extraNumber(extra, 'max_spots');
            const joined = participantsByEvent.get(String(event.id)) ?? 0;
            return {
                id: String(event.id),
                title: String(event.title ?? 'Untitled Event'),
                type: String(event.type ?? 'blood_drive'),
                event_date: String(event.event_date ?? ''),
                start_time: String(event.start_time ?? ''),
                end_time: String(event.end_time ?? ''),
                address: String(event.address ?? ''),
                is_public: event.is_public === true,
                allow_donor_signup: isAllowedDonorEvent(event),
                target_bags: extraNumber(extra, 'target_donation'),
                province: extraString(extra, 'province'),
                city: extraString(extra, 'city') ?? extraString(extra, 'municipality') ?? extraString(extra, 'location'),
                spots_left: maxSpots > 0 ? Math.max(0, maxSpots - joined) : null,
                latitude: typeof event.latitude === 'number' ? event.latitude : null,
                longitude: typeof event.longitude === 'number' ? event.longitude : null,
                map_location_label: typeof event.map_location_label === 'string' ? event.map_location_label : null,
                map_address: typeof event.map_address === 'string' ? event.map_address : null,
            };
        });
        return { data: mapped, error: null };
    }
    async applyToEventAsDonor(userId, eventId) {
        const usersTable = this.supabase.from('users');
        const eventsTable = this.supabase.from('events');
        const participantsTable = this.supabase.from('event_participants');
        const { data: donorUser, error: donorError } = await usersTable
            .select('id, role')
            .eq('id', userId)
            .single();
        if (donorError || !donorUser) {
            return {
                data: null,
                error: toServiceError('DONOR_NOT_FOUND', 'Donor account was not found.', donorError),
            };
        }
        const donorEnabled = await this.isDonorEnabledForUser(userId);
        if (donorEnabled.error || donorEnabled.data == null) {
            return { data: null, error: donorEnabled.error };
        }
        if (!donorEnabled.data) {
            return {
                data: null,
                error: toServiceError('DONOR_ACCESS_REQUIRED', 'Donor account setup is required to sign up to donor events.'),
            };
        }
        const { data: eventRow, error: eventError } = await eventsTable
            .select('id, org_id, status, is_public, visibility, extra_data')
            .eq('setup_status', 'complete')
            .eq('id', eventId)
            .single();
        if (eventError || !eventRow) {
            return {
                data: null,
                error: toServiceError('EVENT_NOT_FOUND', 'Event was not found.', eventError),
            };
        }
        if (String(eventRow.status) !== 'published') {
            return {
                data: null,
                error: toServiceError('INVALID_EVENT_STATE', 'This event is not open for donor signup.'),
            };
        }
        if (!isAllowedDonorEvent(eventRow)) {
            return {
                data: null,
                error: toServiceError('DONOR_SIGNUP_NOT_ALLOWED', 'This event is not open for donor signup.'),
            };
        }
        const { data: existing } = await participantsTable
            .select('*')
            .eq('event_id', eventId)
            .eq('participant_type', 'donor')
            .eq('participant_donor_id', userId)
            .maybeSingle();
        if (existing) {
            return { data: existing, error: null };
        }
        const { data: inserted, error: insertError } = await participantsTable
            .insert({
            org_id: eventRow.org_id,
            event_id: eventId,
            participant_type: 'donor',
            participant_user_id: null,
            participant_donor_id: userId,
            status: 'applied',
        })
            .select('*')
            .single();
        if (insertError || !inserted) {
            return {
                data: null,
                error: toServiceError('DONOR_EVENT_APPLY_FAILED', 'Failed to sign up donor to this event.', insertError),
            };
        }
        return { data: inserted, error: null };
    }
}
exports.DonorService = DonorService;
