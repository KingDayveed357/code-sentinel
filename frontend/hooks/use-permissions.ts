import { useWorkspace } from './use-workspace';
import { useMemo } from 'react';

export type Permission =
  | 'workspace:update'
  | 'workspace:delete'
  | 'workspace:view_settings'
  | 'workspace:view_billing'
  | 'workspace:manage_billing'
  | 'members:invite'
  | 'members:remove'
  | 'members:update_role'
  | 'members:view'
  | 'projects:create'
  | 'projects:update'
  | 'projects:delete'
  | 'projects:view'
  | 'projects:assign'
  | 'scans:create'
  | 'scans:view'
  | 'scans:delete'
  | 'vulnerabilities:view'
  | 'vulnerabilities:update'
  | 'vulnerabilities:assign'
  | 'vulnerabilities:resolve'
  | 'integrations:create'
  | 'integrations:update'
  | 'integrations:delete'
  | 'integrations:view'
  | 'reports:view'
  | 'reports:export'
  | 'reports:create'
  | 'activity:view';

export type WorkspaceRole = 'owner' | 'admin' | 'developer' | 'viewer';

const PERMISSIONS: Record<Permission, WorkspaceRole[]> = {
  'workspace:update': ['owner'],
  'workspace:delete': ['owner'],
  'workspace:view_settings': ['owner', 'admin'],
  'workspace:view_billing': ['owner', 'admin'],
  'workspace:manage_billing': ['owner'],
  'members:invite': ['owner', 'admin'],
  'members:remove': ['owner', 'admin'],
  'members:update_role': ['owner'],
  'members:view': ['owner', 'admin', 'developer', 'viewer'],
  'projects:create': ['owner', 'admin', 'developer'],
  'projects:update': ['owner', 'admin', 'developer'],
  'projects:delete': ['owner', 'admin'],
  'projects:view': ['owner', 'admin', 'developer', 'viewer'],
  'projects:assign': ['owner', 'admin'],
  'scans:create': ['owner', 'admin', 'developer'],
  'scans:view': ['owner', 'admin', 'developer', 'viewer'],
  'scans:delete': ['owner', 'admin'],
  'vulnerabilities:view': ['owner', 'admin', 'developer', 'viewer'],
  'vulnerabilities:update': ['owner', 'admin', 'developer'],
  'vulnerabilities:assign': ['owner', 'admin', 'developer'],
  'vulnerabilities:resolve': ['owner', 'admin', 'developer'],
  'integrations:create': ['owner', 'admin'],
  'integrations:update': ['owner', 'admin'],
  'integrations:delete': ['owner', 'admin'],
  'integrations:view': ['owner', 'admin', 'developer', 'viewer'],
  'reports:view': ['owner', 'admin', 'developer', 'viewer'],
  'reports:export': ['owner', 'admin', 'developer'],
  'reports:create': ['owner', 'admin'],
  'activity:view': ['owner', 'admin'],
};

export function usePermissions() {
  // role comes from workspace.role (set when workspace is loaded with member context)
  const { workspace, role } = useWorkspace();
  const userRole = role as WorkspaceRole | undefined;

  const hasPermission = useMemo(() => {
    return (permission: Permission): boolean => {
      if (!workspace || !userRole) return false;
      const allowedRoles = PERMISSIONS[permission];
      return allowedRoles?.includes(userRole) ?? false;
    };
  }, [workspace, userRole]);

  const canPerformAction = useMemo(() => {
    return (
      action: 'create' | 'read' | 'update' | 'delete',
      resource: string
    ): boolean => {
      const permission = `${resource}:${action === 'read' ? 'view' : action}` as Permission;
      return hasPermission(permission);
    };
  }, [hasPermission]);

  const isOwner = userRole === 'owner';
  const isAdmin = userRole === 'admin';
  const isDeveloper = userRole === 'developer';
  const isViewer = userRole === 'viewer';
  const isOwnerOrAdmin = isOwner || isAdmin;

  return {
    hasPermission,
    canPerformAction,
    userRole,
    isOwner,
    isAdmin,
    isDeveloper,
    isViewer,
    isOwnerOrAdmin,

    // Specific permission checks
    canInviteMembers: hasPermission('members:invite'),
    canRemoveMembers: hasPermission('members:remove'),
    canUpdateRoles: hasPermission('members:update_role'),
    canCreateProjects: hasPermission('projects:create'),
    canDeleteProjects: hasPermission('projects:delete'),
    canAssignProjects: hasPermission('projects:assign'),
    canCreateScans: hasPermission('scans:create'),
    canDeleteScans: hasPermission('scans:delete'),
    canAssignVulnerabilities: hasPermission('vulnerabilities:assign'),
    canManageIntegrations: hasPermission('integrations:create'),
    canViewBilling: hasPermission('workspace:view_billing'),
    canManageBilling: hasPermission('workspace:manage_billing'),
    canViewActivity: hasPermission('activity:view'),
    canExportReports: hasPermission('reports:export'),
  };
}
