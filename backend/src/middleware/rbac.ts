import { FastifyRequest, FastifyReply } from 'fastify';
import { WorkspaceRole } from '../types';

/**
 * RBAC Permission Matrix
 * Defines what each role can do across the platform
 */

export const PERMISSIONS = {
  // Workspace Management
  'workspace:update': ['owner'],
  'workspace:delete': ['owner'],
  'workspace:view_settings': ['owner', 'admin'],
  'workspace:view_billing': ['owner', 'admin'],
  'workspace:manage_billing': ['owner'],

  // Member Management
  'members:invite': ['owner', 'admin'],
  'members:remove': ['owner', 'admin'],
  'members:update_role': ['owner'],
  'members:view': ['owner', 'admin', 'developer', 'viewer'],

  // Project Management
  'projects:create': ['owner', 'admin', 'developer'],
  'projects:update': ['owner', 'admin', 'developer'],
  'projects:delete': ['owner', 'admin'],
  'projects:view': ['owner', 'admin', 'developer', 'viewer'],
  'projects:assign': ['owner', 'admin'],

  // Scan Management
  'scans:create': ['owner', 'admin', 'developer'],
  'scans:view': ['owner', 'admin', 'developer', 'viewer'],
  'scans:delete': ['owner', 'admin'],

  // Vulnerability Management
  'vulnerabilities:view': ['owner', 'admin', 'developer', 'viewer'],
  'vulnerabilities:update': ['owner', 'admin', 'developer'],
  'vulnerabilities:assign': ['owner', 'admin', 'developer'],
  'vulnerabilities:resolve': ['owner', 'admin', 'developer'],

  // Integration Management
  'integrations:create': ['owner', 'admin'],
  'integrations:update': ['owner', 'admin'],
  'integrations:delete': ['owner', 'admin'],
  'integrations:view': ['owner', 'admin', 'developer', 'viewer'],

  // Reports & Analytics
  'reports:view': ['owner', 'admin', 'developer', 'viewer'],
  'reports:export': ['owner', 'admin', 'developer'],
  'reports:create': ['owner', 'admin'],

  // Activity Logs
  'activity:view': ['owner', 'admin'],
} as const;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: WorkspaceRole, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission];
  return allowedRoles?.includes(role) ?? false;
}

/**
 * Check if a role can perform an action on a resource
 */
export function canPerformAction(
  role: WorkspaceRole,
  action: 'create' | 'read' | 'update' | 'delete',
  resource: string
): boolean {
  const permission = `${resource}:${action === 'read' ? 'view' : action}` as Permission;
  return hasPermission(role, permission);
}

/**
 * Fastify middleware to enforce RBAC
 */
export async function requirePermission(
  permission: Permission,
  options?: {
    workspaceIdParam?: string;
    allowSelf?: boolean;
  }
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    
    if (!user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    // Get workspace ID from params or query
    const workspaceIdParam = options?.workspaceIdParam || 'workspaceId';
    const workspaceId = (request.params as any)[workspaceIdParam] || 
                       (request.query as any).workspace_id;

    if (!workspaceId) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Workspace ID required'
      });
    }

    // Get user's role in this workspace
    const { data: membership } = await request.server.supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (!membership) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'You are not a member of this workspace'
      });
    }

    const userRole = membership.role as WorkspaceRole;

    // Check permission
    if (!hasPermission(userRole, permission)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Your role (${userRole}) does not have permission to ${permission}`,
        required_roles: PERMISSIONS[permission]
      });
    }

    // Attach role to request for downstream use
    (request as any).workspaceRole = userRole;
  };
}

/**
 * Require specific role(s)
 */
export async function requireRole(allowedRoles: WorkspaceRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    
    if (!user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const workspaceId = (request.params as any).workspaceId || 
                       (request.query as any).workspace_id;

    if (!workspaceId) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Workspace ID required'
      });
    }

    const { data: membership } = await request.server.supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (!membership) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'You are not a member of this workspace'
      });
    }

    const userRole = membership.role as WorkspaceRole;

    if (!allowedRoles.includes(userRole)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `This action requires one of: ${allowedRoles.join(', ')}. Your role: ${userRole}`,
        required_roles: allowedRoles
      });
    }

    (request as any).workspaceRole = userRole;
  };
}

/**
 * Get user's role in workspace (helper for route handlers)
 */
export async function getUserWorkspaceRole(
  supabase: any,
  userId: string,
  workspaceId: string
): Promise<WorkspaceRole | null> {
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  return membership?.role as WorkspaceRole | null;
}

/**
 * Check if user can access a specific project
 */
export async function canAccessProject(
  supabase: any,
  userId: string,
  projectId: string,
  workspaceId: string
): Promise<boolean> {
  const role = await getUserWorkspaceRole(supabase, userId, workspaceId);
  
  if (!role) return false;

  // Owner, Admin, Viewer can access all projects
  if (['owner', 'admin', 'viewer'].includes(role)) {
    return true;
  }

  // Developer can only access assigned projects
  if (role === 'developer') {
    const { data: assignment } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    return !!assignment;
  }

  return false;
}

/**
 * Check if user can access a specific vulnerability
 */
export async function canAccessVulnerability(
  supabase: any,
  userId: string,
  vulnerabilityId: string,
  workspaceId: string
): Promise<boolean> {
  const role = await getUserWorkspaceRole(supabase, userId, workspaceId);
  
  if (!role) return false;

  // Owner, Admin, Viewer can access all vulnerabilities
  if (['owner', 'admin', 'viewer'].includes(role)) {
    return true;
  }

  // Developer can only access assigned vulnerabilities or their project's vulnerabilities
  if (role === 'developer') {
    const { data: vuln } = await supabase
      .from('vulnerabilities_unified')
      .select('assigned_to, scan_id, scans(repository_id)')
      .eq('id', vulnerabilityId)
      .single();

    if (!vuln) return false;

    // Check if assigned to user
    if (vuln.assigned_to === userId) return true;

    // Check if user is assigned to the project
    const { data: assignment } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', vuln.scans.repository_id)
      .eq('user_id', userId)
      .single();

    return !!assignment;
  }

  return false;
}
