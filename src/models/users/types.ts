// users/types.ts
export interface UserRole {
  type: string;
  permissions: string[];
}

export interface GeographicArea {
  province?: string;
  districts?: number[];
  city?: string;
  barangay?: string;
  [key: string]: unknown;
}

export interface UserRow {
  id: string;
  org_id: string;
  auth_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  geographic_area: GeographicArea | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserCreateInput {
  org_id: string;
  auth_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  geographic_area?: GeographicArea | null;
  is_active?: boolean;
}

export interface UserUpdateInput {
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: UserRole;
  geographic_area?: GeographicArea | null;
  is_active?: boolean;
}
