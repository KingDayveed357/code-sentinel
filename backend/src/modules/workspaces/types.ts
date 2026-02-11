// =====================================================
// modules/workspaces/types.ts
// Workspace-centric type definitions
// =====================================================

export type WorkspaceType = 'personal' | 'team';
export type WorkspacePlan = 'Free' | 'Dev' | 'Team' | 'Enterprise';
export type WorkspaceRole = 'owner' | 'admin' | 'developer' | 'viewer';
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type MemberStatus = 'active' | 'inactive' | 'pending';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  type: WorkspaceType;
  owner_id: string;
  plan: WorkspacePlan;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  status: MemberStatus;
  joined_at: string;
}

export interface WorkspaceInvitation {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  invited_by: string;
  token: string;
  status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface WorkspaceActivity {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface WorkspaceWithRole extends Workspace {
  role: WorkspaceRole;
  memberCount?: number;
}

export interface MemberWithUser extends WorkspaceMember {
  user?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

// Permission definitions
export interface RolePermissions {
  canManageMembers: boolean;
  canInviteMembers: boolean;
  canRemoveMembers: boolean;
  canChangeRoles: boolean;
  canManageBilling: boolean;
  canDeleteWorkspace: boolean;
  canManageProjects: boolean;
  canTriggerScans: boolean;
  canManageIntegrations: boolean;
  canViewActivity: boolean;
  canCreateProjects: boolean;
  canEditProjects: boolean;
  canDeleteProjects: boolean;
}

export const ROLE_PERMISSIONS: Record<WorkspaceRole, RolePermissions> = {
  owner: {
    canManageMembers: true,
    canInviteMembers: true,
    canRemoveMembers: true,
    canChangeRoles: true,
    canManageBilling: true,
    canDeleteWorkspace: true,
    canManageProjects: true,
    canTriggerScans: true,
    canManageIntegrations: true,
    canViewActivity: true,
    canCreateProjects: true,
    canEditProjects: true,
    canDeleteProjects: true,
  },
  admin: {
    canManageMembers: true,
    canInviteMembers: true,
    canRemoveMembers: true,
    canChangeRoles: false,
    canManageBilling: false,
    canDeleteWorkspace: false,
    canManageProjects: true,
    canTriggerScans: true,
    canManageIntegrations: true,
    canViewActivity: true,
    canCreateProjects: true,
    canEditProjects: true,
    canDeleteProjects: true,
  },
  developer: {
    canManageMembers: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canManageBilling: false,
    canDeleteWorkspace: false,
    canManageProjects: true,
    canTriggerScans: true,
    canManageIntegrations: false,
    canViewActivity: true,
    canCreateProjects: true,
    canEditProjects: true,
    canDeleteProjects: false,
  },
  viewer: {
    canManageMembers: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canManageBilling: false,
    canDeleteWorkspace: false,
    canManageProjects: false,
    canTriggerScans: false,
    canManageIntegrations: false,
    canViewActivity: true,
    canCreateProjects: false,
    canEditProjects: false,
    canDeleteProjects: false,
  },
};

export function getPermissions(role: WorkspaceRole): RolePermissions {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(
  role: WorkspaceRole,
  permission: keyof RolePermissions
): boolean {
  return ROLE_PERMISSIONS[role][permission];
}
