import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OrganizationCreateInput,
  OrganizationRow,
} from '../../models/organizations/types';

export interface ServiceError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ServiceResult<T> {
  data: T | null;
  error: ServiceError | null;
}

const OrganizationCreateSchema = z.object({
  name: z.string().trim().min(2),
  code: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[A-Z0-9_-]+$/),
  contact_email: z.string().email().optional().nullable(),
  contact_phone: z.string().trim().min(3).max(32).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional(),
});

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function toServiceError(code: string, message: string, details?: unknown): ServiceError {
  return { code, message, details };
}

export class OrganizationService {
  constructor(private readonly supabase: SupabaseClient) {}

  async createOrganization(
    input: OrganizationCreateInput
  ): Promise<ServiceResult<OrganizationRow>> {
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
          error: toServiceError(
            'ORG_CODE_EXISTS',
            'Organization code is already in use.'
          ),
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
          error: toServiceError(
            'ORG_CREATE_FAILED',
            'Failed to create organization.',
            error
          ),
        };
      }

      return { data: data as OrganizationRow, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError(
          'ORG_CREATE_VALIDATION_ERROR',
          'Invalid organization payload.',
          error
        ),
      };
    }
  }

  async findOrganizationByCode(code: string): Promise<ServiceResult<OrganizationRow | null>> {
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
          error: toServiceError(
            'ORG_LOOKUP_FAILED',
            'Failed to fetch organization by code.',
            error
          ),
        };
      }

      return { data: (data as OrganizationRow | null) ?? null, error: null };
    } catch (error) {
      return {
        data: null,
        error: toServiceError(
          'ORG_LOOKUP_VALIDATION_ERROR',
          'Invalid organization code.',
          error
        ),
      };
    }
  }

  async validateOrganizationCode(
    code: string
  ): Promise<ServiceResult<{ valid: boolean; organization: OrganizationRow | null }>> {
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
