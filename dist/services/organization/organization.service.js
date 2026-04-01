"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrganizationService = void 0;
const zod_1 = require("zod");
const OrganizationCreateSchema = zod_1.z.object({
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
});
function normalizeCode(code) {
    return code.trim().toUpperCase();
}
function toServiceError(code, message, details) {
    return { code, message, details };
}
class OrganizationService {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
    }
    async createOrganization(input) {
        try {
            const parsed = OrganizationCreateSchema.parse({
                ...input,
                code: normalizeCode(input.code),
            });
            const existing = await this.findOrganizationByCode(parsed.code);
            if (existing.error) {
                return { data: null, error: existing.error };
            }
            if (existing.data) {
                return {
                    data: null,
                    error: toServiceError('ORG_CODE_EXISTS', 'Organization code is already in use.'),
                };
            }
            const { data, error } = await this.supabase
                .from('organizations')
                .insert({
                name: parsed.name,
                code: parsed.code,
                contact_email: parsed.contact_email ?? null,
                contact_phone: parsed.contact_phone ?? null,
                metadata: parsed.metadata ?? {},
                is_active: parsed.is_active ?? true,
            })
                .select('*')
                .single();
            if (error) {
                return {
                    data: null,
                    error: toServiceError('ORG_CREATE_FAILED', 'Failed to create organization.', error),
                };
            }
            return { data: data, error: null };
        }
        catch (error) {
            return {
                data: null,
                error: toServiceError('ORG_CREATE_VALIDATION_ERROR', 'Invalid organization payload.', error),
            };
        }
    }
    async findOrganizationByCode(code) {
        try {
            const normalizedCode = normalizeCode(code);
            const { data, error } = await this.supabase
                .from('organizations')
                .select('*')
                .ilike('code', normalizedCode)
                .maybeSingle();
            if (error) {
                return {
                    data: null,
                    error: toServiceError('ORG_LOOKUP_FAILED', 'Failed to fetch organization by code.', error),
                };
            }
            return { data: data ?? null, error: null };
        }
        catch (error) {
            return {
                data: null,
                error: toServiceError('ORG_LOOKUP_VALIDATION_ERROR', 'Invalid organization code.', error),
            };
        }
    }
    async validateOrganizationCode(code) {
        const orgResult = await this.findOrganizationByCode(code);
        if (orgResult.error) {
            return { data: null, error: orgResult.error };
        }
        const organization = orgResult.data;
        const valid = Boolean(organization && organization.is_active);
        return {
            data: {
                valid,
                organization: valid ? organization : null,
            },
            error: null,
        };
    }
}
exports.OrganizationService = OrganizationService;
