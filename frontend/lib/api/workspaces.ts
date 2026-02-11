// // lib/api/workspaces.ts
// import { apiFetch } from "../api";

// export interface Workspace {
//   id: string;
//   name: string;
//   slug: string;
//   type: 'personal' | 'team';
//   owner_id: string | null;
//   team_id: string | null;
//   plan: string;
//   settings: any;
//   created_at: string;
//   updated_at: string;
// }

// export interface ListWorkspacesResponse {
//   workspaces: Workspace[];
// }

// export const workspacesApi = {
//   /**
//    * Get all workspaces accessible to the current user
//    */
//   list: async (): Promise<ListWorkspacesResponse> => {
//     return apiFetch('/workspaces', { requireAuth: true });
//   },



//   getMembers: async (workspaceId: string): Promise<{ members: any[] }> => {
//     return apiFetch(`/workspaces/${workspaceId}/members`, { requireAuth: true });
//   },

//   inviteMember: async (workspaceId: string, email: string, role: string): Promise<{ invitation: any }> => {
//     return apiFetch(`/workspaces/${workspaceId}/invitations`, {
//         method: 'POST',
//         body: JSON.stringify({ email, role }),
//         requireAuth: true
//     });
//   },


//   bootstrap: async (): Promise<{ workspace: Workspace }> => {

//     return apiFetch('/workspaces/bootstrap', {
//       method: 'POST',
//       requireAuth: true,
//     });
//   }
// };

// // Type guard to ensure workspace has all required fields
// export function isValidWorkspace(workspace: any): workspace is Workspace {
//   return (
//     workspace &&
//     typeof workspace.id === 'string' &&
//     typeof workspace.name === 'string' &&
//     typeof workspace.slug === 'string' &&
//     (workspace.type === 'personal' || workspace.type === 'team') &&
//     typeof workspace.plan === 'string'
//   );
// }


// =====================================================
// lib/api/workspaces.ts
// Workspace API Client
// =====================================================

import { apiFetch } from "../api";


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

export interface WorkspaceWithRole extends Workspace {
  role: WorkspaceRole;
  memberCount?: number;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  status: MemberStatus;
  joined_at: string;
  user?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
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

export interface CreateWorkspaceData {
  name: string;
  type: WorkspaceType;
  plan?: WorkspacePlan;
}

export interface UpdateWorkspaceData {
  name?: string;
  settings?: Record<string, any>;
}

export interface InviteMemberData {
  email: string;
  role: WorkspaceRole;
}

export interface UpdateMemberRoleData {
  role: WorkspaceRole;
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

// =====================================================
// API Functions
// =====================================================

/**
 * List all workspaces accessible to the current user
 */
export async function listWorkspaces(): Promise<WorkspaceWithRole[]> {
  return apiFetch('/workspaces', {
    requireAuth: true,
  });
}

/**
 * Get workspace details
 */
export async function getWorkspace(workspaceId: string): Promise<WorkspaceWithRole> {
  return apiFetch(`/workspaces/${workspaceId}`, {
    requireAuth: true,
  });
}

/**
 * Create a new workspace
 */
export async function createWorkspace(data: CreateWorkspaceData): Promise<Workspace> {
  return apiFetch('/workspaces', {
    method: 'POST',
    body: JSON.stringify(data),
    requireAuth: true,
  });
}

/**
 * Update workspace
 */
export async function updateWorkspace(
  workspaceId: string,
  data: UpdateWorkspaceData
): Promise<Workspace> {
  return apiFetch(`/workspaces/${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
    requireAuth: true,
  });
}

/**
 * Delete workspace
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await apiFetch(`/workspaces/${workspaceId}`, {
    method: 'DELETE',
    requireAuth: true,
  });
}

// =====================================================
// Members Management
// =====================================================

/**
 * List workspace members
 */
export async function getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  return apiFetch(`/workspaces/${workspaceId}/members`, {
    requireAuth: true,
  });
}

/**
 * Remove member from workspace
 */
export async function removeMember(workspaceId: string, memberId: string): Promise<void> {
  await apiFetch(`/workspaces/${workspaceId}/members/${memberId}`, {
    method: 'DELETE',
    requireAuth: true,
  });
}

/**
 * Update member role
 */
export async function updateMemberRole(
  workspaceId: string,
  memberId: string,
  data: UpdateMemberRoleData
): Promise<WorkspaceMember> {
  return apiFetch(`/workspaces/${workspaceId}/members/${memberId}/role`, {
    method: 'PATCH',
    body: JSON.stringify(data),
    requireAuth: true,
  });
}

// =====================================================
// Invitations
// =====================================================

/**
 * Get pending invitations for workspace
 */
export async function getInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
  return apiFetch(`/workspaces/${workspaceId}/invitations`, {
    requireAuth: true,
  });
}

/**
 * Invite member to workspace
 */
export async function inviteMember(
  workspaceId: string,
  data: InviteMemberData
): Promise<WorkspaceInvitation> {
  return apiFetch(`/workspaces/${workspaceId}/invitations`, {
    method: 'POST',
    body: JSON.stringify(data),
    requireAuth: true,
  });
}

/**
 * Accept workspace invitation
 */
export async function acceptInvitation(token: string): Promise<{
  workspace: Workspace;
  member: WorkspaceMember;
}> {
  return apiFetch(`/workspaces/invitations/${token}/accept`, {
    method: 'POST',
    body: JSON.stringify({}),
    requireAuth: true,
  });
}

/**
 * Cancel invitation
 */
export async function cancelInvitation(
  workspaceId: string,
  invitationId: string
): Promise<void> {
  await apiFetch(`/workspaces/${workspaceId}/invitations/${invitationId}`, {
    method: 'DELETE',
    requireAuth: true,
  });
}

// =====================================================
// Activity Log
// =====================================================

/**
 * Get workspace activity log
 */
export async function getActivity(
  workspaceId: string,
  options?: { limit?: number; offset?: number }
): Promise<WorkspaceActivity[]> {
  return apiFetch(`/workspaces/${workspaceId}/activity`, {
    requireAuth: true,
    params: {
      limit: options?.limit,
      offset: options?.offset,
    },
  });
}

/**
 * Bootstrap workspace - creates personal workspace if it doesn't exist
 * This is called during auth initialization
 */
export async function bootstrapWorkspace(): Promise<{ workspace: Workspace }> {
  return apiFetch('/workspaces/bootstrap', {
    method: 'POST',
    requireAuth: true,
  });
}

