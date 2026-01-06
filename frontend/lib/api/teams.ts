// lib/api/teams.ts - Team API Client
import { apiFetch } from "../api";

export interface Team {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  plan: 'Team' | 'Enterprise';
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'developer' | 'viewer';
  status: 'active' | 'pending' | 'suspended';
  joined_at: string | null;
  users: {
    id: string;
    email: string;
    full_name: string;
    avatar_url: string | null;
  };
}

export interface TeamInvitation {
  id: string;
  team_id: string;
  email: string;
  role: 'admin' | 'developer' | 'viewer';
  invited_by: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  created_at: string;
  expires_at: string;
  token: string;
}

export interface TeamActivity {
  id: string;
  team_id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  metadata: any;
  created_at: string;
  users: {
    name: string;
    email: string;
    avatar_url: string | null;
  } | null;
}

export interface VulnerabilityAssignment {
  id: string;
  vulnerability_id: string;
  vulnerability_type: 'sast' | 'sca' | 'secrets' | 'iac' | 'container';
  team_id: string;
  assigned_to: string | null;
  status: 'open' | 'in_progress' | 'fixed' | 'ignored';
  priority: 'critical' | 'high' | 'medium' | 'low' | null;
  notes: string | null;
  assigned_at: string;
}

export const teamsApi = {
  /**
   * Create a new team
   */
  create: async (data: {
    name: string;
    plan?: 'Team' | 'Enterprise';
  }): Promise<{ success: boolean; team: Team }> => {
    return apiFetch('/teams', {
      method: 'POST',
      requireAuth: true,
      body: JSON.stringify(data),
    });
  },

  /**
   * List user's teams
   * Returns canonical shape: { team_id, team_name, user_role, member_count }
   */
  list: async (): Promise<{
    success: boolean;
    teams: Array<{
      team_id: string;
      team_name: string;
      user_role: 'owner' | 'admin' | 'developer' | 'viewer';
      member_count: number;
    }>;
  }> => {
    return apiFetch('/teams', {
      requireAuth: true,
    });
  },

  /**
   * Get team details
   */
  get: async (teamId: string): Promise<{
    success: boolean;
    team: {
      id: string;
      name: string;
      slug: string;
      owner_id: string;
      plan: 'Team' | 'Enterprise';
      subscription_status: 'active' | 'past_due' | 'canceled' | 'trialing' | null;
      created_at: string;
      updated_at: string;
      role: 'owner' | 'admin' | 'developer' | 'viewer';
      isOwner: boolean;
    };
    members: TeamMember[];
    invitations: TeamInvitation[];
  }> => {
    return apiFetch(`/teams/${teamId}`, {
      requireAuth: true,
    });
  },

  /**
   * Invite member to team
   */
  invite: async (
    teamId: string,
    data: { email: string; role: 'admin' | 'developer' | 'viewer' }
  ): Promise<{ success: boolean; invitation: TeamInvitation }> => {
    return apiFetch(`/teams/${teamId}/invite`, {
      method: 'POST',
      requireAuth: true,
      body: JSON.stringify(data),
    });
  },

  /**
   * Accept team invitation
   */
  acceptInvitation: async (token: string): Promise<{
    success: boolean;
    team: Team;
    member: TeamMember;
  }> => {
    return apiFetch(`/teams/invitations/${token}/accept`, {
      method: 'POST',
      requireAuth: true,
    });
  },

  /**
   * Remove member from team
   */
  removeMember: async (teamId: string, memberId: string): Promise<{
    success: boolean;
    message: string;
  }> => {
    return apiFetch(`/teams/${teamId}/members/${memberId}`, {
      method: 'DELETE',
      requireAuth: true,
    });
  },

  /**
   * Update member role
   */
  updateMemberRole: async (
    teamId: string,
    memberId: string,
    role: 'admin' | 'developer' | 'viewer'
  ): Promise<{ success: boolean; member: TeamMember }> => {
    return apiFetch(`/teams/${teamId}/members/${memberId}/role`, {
      method: 'PATCH',
      requireAuth: true,
      body: JSON.stringify({ role }),
    });
  },

  /**
   * Get team activity log
   */
  getActivity: async (
    teamId: string,
    params?: { page?: number; limit?: number }
  ): Promise<{
    success: boolean;
    activities: TeamActivity[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));

    return apiFetch(`/teams/${teamId}/activity?${query}`, {
      requireAuth: true,
    });
  },

  /**
   * Assign vulnerability to team member
   */
  assignVulnerability: async (
    teamId: string,
    data: {
      vulnerability_id: string;
      vulnerability_type: 'sast' | 'sca' | 'secrets' | 'iac' | 'container';
      assigned_to: string | null;
      priority?: 'critical' | 'high' | 'medium' | 'low';
      notes?: string;
    }
  ): Promise<{ success: boolean; assignment: VulnerabilityAssignment }> => {
    return apiFetch(`/teams/${teamId}/vulnerabilities/assign`, {
      method: 'POST',
      requireAuth: true,
      body: JSON.stringify(data),
    });
  },

  /**
   * Get team vulnerabilities with assignments
   */
  getVulnerabilities: async (
    teamId: string,
    params?: {
      assignedTo?: string;
      status?: string;
      severity?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{
    vulnerabilities: any[];
    total: number;
    page: number;
    pages: number;
  }> => {
    const query = new URLSearchParams();
    if (params?.assignedTo) query.set('assignedTo', params.assignedTo);
    if (params?.status) query.set('status', params.status);
    if (params?.severity) query.set('severity', params.severity);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));

    return apiFetch(`/teams/${teamId}/vulnerabilities?${query}`, {
      requireAuth: true,
    });
  },

  /**
   * Grant repository access to team member
   */
  grantRepositoryAccess: async (
    teamId: string,
    repositoryId: string,
    data: {
      access_scope: 'team' | 'member';
      member_id?: string;
    }
  ): Promise<{ success: boolean }> => {
    return apiFetch(`/teams/${teamId}/repositories/${repositoryId}/access`, {
      method: 'POST',
      requireAuth: true,
      body: JSON.stringify(data),
    });
  },

  /**
   * Revoke repository access
   */
  revokeRepositoryAccess: async (
    teamId: string,
    repositoryId: string,
    memberId?: string
  ): Promise<{ success: boolean }> => {
    const query = memberId ? `?memberId=${memberId}` : '';
    return apiFetch(`/teams/${teamId}/repositories/${repositoryId}/access${query}`, {
      method: 'DELETE',
      requireAuth: true,
    });
  },

  /**
   * Update team name (owner only)
   */
  updateTeam: async (
    teamId: string,
    data: { name: string }
  ): Promise<{ success: boolean; team: Team }> => {
    return apiFetch(`/teams/${teamId}`, {
      method: 'PATCH',
      requireAuth: true,
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete team (owner only)
   */
  deleteTeam: async (teamId: string): Promise<{ success: boolean; message: string }> => {
    return apiFetch(`/teams/${teamId}`, {
      method: 'DELETE',
      requireAuth: true,
    });
  },
};