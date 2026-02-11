// lib/api/members.ts
import { apiFetch } from "../api";

export interface WorkspaceMember {
  id: string;
  user_id: string; // Added for correct user identification
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'active' | 'pending' | 'removed';
  joined_at?: string;
}

export interface InviteMemberRequest {
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  token: string;
  invited_by: string;
  created_at: string;
}

export const membersApi = {
  /**
   * Get all members of a workspace
   */
  getMembers: async (workspaceId: string): Promise<WorkspaceMember[]> => {
    const members = await apiFetch(`/workspaces/${workspaceId}/members`, {
      requireAuth: true,
    });
    
    // Map backend response (nested user object) to frontend interface (flat properties)
    return Array.isArray(members) ? members.map((m: any) => ({
      id: m.id,
      user_id: m.user_id, // Map user_id
      email: m.user?.email || m.email,
      full_name: m.user?.full_name || m.full_name,
      avatar_url: m.user?.avatar_url || m.avatar_url,
      role: m.role,
      status: m.status,
      joined_at: m.joined_at,
    })) : [];
  },
  
  /**
   * Get pending invitations for workspace
   */
  getInvitations: async (workspaceId: string): Promise<Invitation[]> => {
    const response = await apiFetch(`/workspaces/${workspaceId}/invitations`, {
      requireAuth: true,
    });
    return Array.isArray(response) ? response : [];
  },

  /**
   * Invite a new member to the workspace
   */
  inviteMember: async (
    workspaceId: string,
    data: InviteMemberRequest
  ): Promise<Invitation> => {
    console.log('📧 Sending invitation:', {
      workspaceId,
      email: data.email,
      role: data.role,
    });
    return apiFetch(`/workspaces/${workspaceId}/invitations`, {
      method: "POST",
      body: JSON.stringify(data),
      requireAuth: true,
    });
  },

  /**
   * Remove a member from the workspace
   */
  removeMember: async (
    workspaceId: string,
    memberId: string
  ): Promise<void> => {
    await apiFetch(`/workspaces/${workspaceId}/members/${memberId}`, {
      method: "DELETE",
      requireAuth: true,
    });
  },

  /**
   * Update a member's role
   */
  updateMemberRole: async (
    workspaceId: string,
    memberId: string,
    role: 'owner' | 'admin' | 'member' | 'viewer'
  ): Promise<void> => {
    await apiFetch(`/workspaces/${workspaceId}/members/${memberId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
      requireAuth: true,
    });
  },

  /**
   * Get role badge color
   */
  getRoleBadgeVariant: (role: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (role) {
      case 'owner':
        return 'default';
      case 'admin':
        return 'secondary';
      case 'member':
        return 'outline';
      case 'viewer':
        return 'outline';
      default:
        return 'outline';
    }
  },

  /**
   * Get role display name
   */
  getRoleDisplayName: (role: string): string => {
    return role.charAt(0).toUpperCase() + role.slice(1);
  },

  /**
   * Check if user can perform action based on role
   */
  canInviteMembers: (role: string): boolean => {
    return ['owner', 'admin'].includes(role);
  },

  canRemoveMembers: (role: string): boolean => {
    return ['owner', 'admin'].includes(role);
  },

  canChangeRoles: (role: string): boolean => {
    return role === 'owner';
  },

  /**
   * Remove/Cancel an invitation
   */
  removeInvitation: async (
    workspaceId: string,
    invitationId: string
  ): Promise<void> => {
    return apiFetch(`/workspaces/${workspaceId}/invitations/${invitationId}`, {
      method: "DELETE",
      requireAuth: true,
    });
  },
};
