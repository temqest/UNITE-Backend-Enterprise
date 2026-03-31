/**
 * Authentication Types
 * Shared types for auth services
 */

export interface LoginInput {
  email: string;
  password: string;
}

export interface MagicLinkInput {
  email: string;
  redirectTo?: string;
}

export interface UserRole {
  type:
    | 'super_admin'
    | 'admin'
    | 'coordinator'
    | 'stakeholder'
    | 'donor'
    | 'viewer'
    | 'org_admin'
    | 'staff';
  permissions: string[];
}

export interface GeographicArea {
  country?: string;
  state?: string;
  city?: string;
  district?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface SessionUser {
  id: string;
  auth_id?: string;
  email: string;
  full_name: string;
  phone_number?: string;
  org_id?: string;
  role: UserRole;
  is_active: boolean;
  geographic_area?: GeographicArea;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInfo {
  id: string;
  name: string;
  is_active: boolean;
  settings?: any;
}

export interface LoginResponse {
  user: SessionUser;
  organization?: OrganizationInfo;
  accessToken: string;
  refreshToken: string;
  redirectTo: string;
}

export interface SessionValidationResult {
  isValid: boolean;
  user?: SessionUser;
  organization?: OrganizationInfo;
  reason?: 'inactive_user' | 'inactive_org' | 'unverified_email' | 'no_session' | 'invalid_token';
}

export interface AuthError {
  code: string;
  message: string;
  details?: any;
}

export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  UNVERIFIED_EMAIL = 'UNVERIFIED_EMAIL',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  INACTIVE_USER = 'INACTIVE_USER',
  INACTIVE_ORG = 'INACTIVE_ORG',
  NO_ORGANIZATION = 'NO_ORGANIZATION',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
