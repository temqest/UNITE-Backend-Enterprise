// organizations/types.ts
export interface OrganizationRow {
  id: string;
  name: string;
  code: string;
  contact_email: string | null;
  contact_phone: string | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationCreateInput {
  name: string;
  code: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
}

export interface OrganizationUpdateInput {
  name?: string;
  code?: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
}
