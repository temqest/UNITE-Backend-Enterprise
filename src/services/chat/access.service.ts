import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '../../lib/supabase/supabase.client';
import type { UserRow } from '../../models/users/types';
import type { OrganizationSettingsRow } from '../../models/organization_settings/types';
import type { ServiceError, ServiceResult, AccessCheckContext } from './types';
import { toServiceError, isGeoAreaMatch } from './types';

/**
 * Access validation service for chat functionality
 * Validates whether users can chat based on org, geo, and role rules
 */
export class AccessService {
  constructor(private readonly supabase: SupabaseClient = supabaseServer) {}

  /**
   * Fetch user with full context (role, geo, org_id)
   */
  async getUserContext(userId: string): Promise<ServiceResult<AccessCheckContext>> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, org_id, role, geographic_area')
        .eq('id', userId)
        .single();

      if (error) {
        return {
          data: null,
          error: toServiceError('USER_FETCH_FAILED', `Failed to fetch user: ${error.message}`, error),
        };
      }

      if (!data) {
        return {
          data: null,
          error: toServiceError('USER_NOT_FOUND', `User not found: ${userId}`),
        };
      }

      return {
        data: {
          user_id: data.id,
          org_id: data.org_id,
          role: (data.role as Record<string, unknown>) || {},
          geographic_area: (data.geographic_area as Record<string, unknown>) || null,
        },
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        error: toServiceError('USER_CONTEXT_ERROR', 'Unexpected error while fetching user context', err),
      };
    }
  }

  /**
   * Fetch organization settings to check role filtering rules
   */
  async getOrgSettings(orgId: string): Promise<ServiceResult<OrganizationSettingsRow>> {
    try {
      const { data, error } = await this.supabase
        .from('organization_settings')
        .select('*')
        .eq('org_id', orgId)
        .single();

      if (error) {
        return {
          data: null,
          error: toServiceError('ORG_SETTINGS_FETCH_FAILED', `Failed to fetch org settings: ${error.message}`, error),
        };
      }

      if (!data) {
        return {
          data: null,
          error: toServiceError('ORG_SETTINGS_NOT_FOUND', `Organization settings not found for org: ${orgId}`),
        };
      }

      return { data, error: null };
    } catch (err) {
      return {
        data: null,
        error: toServiceError('ORG_SETTINGS_ERROR', 'Unexpected error while fetching org settings', err),
      };
    }
  }

  /**
   * Check if two users can communicate based on:
   * - Same organization
   * - Geographic area compatibility (optional - depends on org policy)
   * - Role-based filtering (optional - depends on org policy)
   */
  async canUserChat(userId: string, targetUserId: string): Promise<ServiceResult<boolean>> {
    // Prevent self-chat
    if (userId === targetUserId) {
      return {
        data: false,
        error: toServiceError('SELF_CHAT_NOT_ALLOWED', 'Users cannot chat with themselves'),
      };
    }

    try {
      const userContextResult = await this.getUserContext(userId);
      if (userContextResult.error || !userContextResult.data) {
        return {
          data: false,
          error: userContextResult.error || toServiceError('USER_CONTEXT_FAILED', 'Failed to get user context'),
        };
      }

      const targetContextResult = await this.getUserContext(targetUserId);
      if (targetContextResult.error || !targetContextResult.data) {
        return {
          data: false,
          error: targetContextResult.error || toServiceError('TARGET_CONTEXT_FAILED', 'Failed to get target user context'),
        };
      }

      const userContext = userContextResult.data;
      const targetContext = targetContextResult.data;

      // Must be in same organization
      if (userContext.org_id !== targetContext.org_id) {
        return {
          data: false,
          error: toServiceError('DIFFERENT_ORG', 'Users must be in the same organization to chat'),
        };
      }

      // Fetch org settings to check if geo/role filtering is enabled
      const orgSettingsResult = await this.getOrgSettings(userContext.org_id);
      if (orgSettingsResult.error) {
        return {
          data: false,
          error: orgSettingsResult.error,
        };
      }

      const orgSettings = orgSettingsResult.data;
      const config = (orgSettings?.config as Record<string, unknown>) || {};

      // Check geographic area if policy requires it
      const enforceGeoMatch = config.enforce_chat_geo_match === true;
      if (enforceGeoMatch) {
        const geoMatch = isGeoAreaMatch(userContext.geographic_area, targetContext.geographic_area);
        if (!geoMatch) {
          return {
            data: false,
            error: toServiceError('GEO_MISMATCH', 'Geographic areas do not match and are required to chat'),
          };
        }
      }

      // Check role-based filtering if policy requires it
      const enforceRoleHierarchy = config.enforce_chat_role_hierarchy === true;
      if (enforceRoleHierarchy) {
        const roleCheck = this.checkRoleHierarchy(userContext, targetContext);
        if (!roleCheck) {
          return {
            data: false,
            error: toServiceError('ROLE_HIERARCHY_VIOLATION', 'Role hierarchy does not permit this chat'),
          };
        }
      }

      return { data: true, error: null };
    } catch (err) {
      return {
        data: false,
        error: toServiceError('CHAT_ACCESS_ERROR', 'Unexpected error checking chat access', err),
      };
    }
  }

  /**
   * Validate that both participants are in the same org
   * (Simpler check for internal validation)
   */
  async validateChatParticipants(orgId: string, participant1Id: string, participant2Id: string): Promise<ServiceResult<boolean>> {
    if (participant1Id === participant2Id) {
      return {
        data: false,
        error: toServiceError('SAME_PARTICIPANT', 'Cannot create chat between the same participant'),
      };
    }

    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, org_id')
        .in('id', [participant1Id, participant2Id]);

      if (error) {
        return {
          data: false,
          error: toServiceError('VALIDATE_PARTICIPANTS_FAILED', `Failed to validate participants: ${error.message}`, error),
        };
      }

      if (!data || data.length !== 2) {
        return {
          data: false,
          error: toServiceError('PARTICIPANTS_NOT_FOUND', 'One or both participants not found'),
        };
      }

      // Verify all participants are in the specified org
      const allInOrg = data.every((user: Record<string, unknown>) => user.org_id === orgId);
      if (!allInOrg) {
        return {
          data: false,
          error: toServiceError('PARTICIPANTS_DIFF_ORG', 'Not all participants belong to the specified organization'),
        };
      }

      return { data: true, error: null };
    } catch (err) {
      return {
        data: false,
        error: toServiceError('VALIDATE_ERROR', 'Unexpected error validating participants', err),
      };
    }
  }

  /**
   * Check if user can read/access messages in a chat
   * User must be a participant in the chat
   */
  async validateChatAccess(chatId: string, userId: string): Promise<ServiceResult<boolean>> {
    try {
      const { data, error } = await this.supabase
        .from('chats')
        .select('id, participant_1_id, participant_2_id, org_id')
        .eq('id', chatId)
        .single();

      if (error) {
        return {
          data: false,
          error: toServiceError('CHAT_FETCH_FAILED', `Failed to fetch chat: ${error.message}`, error),
        };
      }

      if (!data) {
        return {
          data: false,
          error: toServiceError('CHAT_NOT_FOUND', `Chat not found: ${chatId}`),
        };
      }

      const isParticipant = data.participant_1_id === userId || data.participant_2_id === userId;
      if (!isParticipant) {
        return {
          data: false,
          error: toServiceError('NOT_CHAT_PARTICIPANT', 'User is not a participant in this chat'),
        };
      }

      return { data: true, error: null };
    } catch (err) {
      return {
        data: false,
        error: toServiceError('CHAT_ACCESS_ERROR', 'Unexpected error checking chat access', err),
      };
    }
  }

  /**
   * Simple role hierarchy check (customize per org needs)
   * Example: coordinators can chat with all roles, donors only with coordinators
   */
  private checkRoleHierarchy(userContext: AccessCheckContext, targetContext: AccessCheckContext): boolean {
    const userRoleType = typeof userContext.role.type === 'string' ? userContext.role.type : '';
    const targetRoleType = typeof targetContext.role.type === 'string' ? targetContext.role.type : '';

    // Hierarchy: super_admin > admin > coordinator > stakeholder > donor
    const hierarchy: Record<string, number> = {
      super_admin: 5,
      admin: 4,
      coordinator: 3,
      stakeholder: 2,
      donor: 1,
    };

    const userRank = hierarchy[userRoleType] ?? 0;
    const targetRank = hierarchy[targetRoleType] ?? 0;

    // Allow if same rank or user is higher in hierarchy
    if (userRank >= targetRank) {
      return true;
    }

    // Lower ranked users can chat with higher ranked (but not vice versa without permission)
    // This is a flexible rule; adjust per requirements
    return true;
  }

}

/**
 * Singleton instance
 */
export const accessService = new AccessService();
