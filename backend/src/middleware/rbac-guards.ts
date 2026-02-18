// src/middleware/rbac-guards.ts
// =====================================================
// Composable RBAC preHandler guards
//
// DESIGN PRINCIPLE: resolveWorkspace already fetches the user's role and
// attaches it to `request.workspaceRole`. These guards simply read that
// value — no extra DB round-trips.
//
// Usage in routes:
//   fastify.post('/...', {
//     preHandler: [requireWorkspaceRole(['owner', 'admin'])]
//   }, handler)
// =====================================================

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { WorkspaceRole } from '../types/fastify';

export type { WorkspaceRole };

// ─── Permission Matrix ────────────────────────────────────────────────────────
// Single source of truth for what each role can do.
// Mirrors frontend use-permissions.ts exactly.
export const ROLE_PERMISSIONS = {
  // Workspace
  'workspace:update':        ['owner'] as WorkspaceRole[],
  'workspace:delete':        ['owner'] as WorkspaceRole[],
  'workspace:view_settings': ['owner', 'admin'] as WorkspaceRole[],
  'workspace:view_billing':  ['owner', 'admin'] as WorkspaceRole[],
  'workspace:manage_billing':['owner'] as WorkspaceRole[],

  // Members
  'members:invite':          ['owner', 'admin'] as WorkspaceRole[],
  'members:remove':          ['owner', 'admin'] as WorkspaceRole[],
  'members:update_role':     ['owner'] as WorkspaceRole[],
  'members:view':            ['owner', 'admin', 'developer', 'viewer'] as WorkspaceRole[],

  // Projects (repositories)
  'projects:create':         ['owner', 'admin', 'developer'] as WorkspaceRole[],
  'projects:update':         ['owner', 'admin', 'developer'] as WorkspaceRole[],
  'projects:delete':         ['owner', 'admin'] as WorkspaceRole[],
  'projects:view':           ['owner', 'admin', 'developer', 'viewer'] as WorkspaceRole[],
  'projects:assign':         ['owner', 'admin'] as WorkspaceRole[],

  // Scans
  'scans:create':            ['owner', 'admin', 'developer'] as WorkspaceRole[],
  'scans:view':              ['owner', 'admin', 'developer', 'viewer'] as WorkspaceRole[],
  'scans:delete':            ['owner', 'admin'] as WorkspaceRole[],

  // Vulnerabilities
  'vulnerabilities:view':    ['owner', 'admin', 'developer', 'viewer'] as WorkspaceRole[],
  'vulnerabilities:update':  ['owner', 'admin', 'developer'] as WorkspaceRole[],
  'vulnerabilities:assign':  ['owner', 'admin', 'developer'] as WorkspaceRole[],
  'vulnerabilities:resolve': ['owner', 'admin', 'developer'] as WorkspaceRole[],

  // Integrations
  'integrations:create':     ['owner', 'admin'] as WorkspaceRole[],
  'integrations:update':     ['owner', 'admin'] as WorkspaceRole[],
  'integrations:delete':     ['owner', 'admin'] as WorkspaceRole[],
  'integrations:view':       ['owner', 'admin', 'developer', 'viewer'] as WorkspaceRole[],

  // Reports
  'reports:view':            ['owner', 'admin', 'developer', 'viewer'] as WorkspaceRole[],
  'reports:export':          ['owner', 'admin', 'developer'] as WorkspaceRole[],
  'reports:create':          ['owner', 'admin'] as WorkspaceRole[],

  // Activity
  'activity:view':           ['owner', 'admin'] as WorkspaceRole[],
} as const;

export type Permission = keyof typeof ROLE_PERMISSIONS;

// ─── Pure helper ─────────────────────────────────────────────────────────────
export function roleHasPermission(role: WorkspaceRole, permission: Permission): boolean {
  const allowed = ROLE_PERMISSIONS[permission] as readonly string[];
  return allowed.includes(role);
}

// ─── Prehandler factory ───────────────────────────────────────────────────────
/**
 * requirePermission('scans:create')
 *
 * Returns a Fastify preHandler that enforces a single permission.
 * Must run AFTER resolveWorkspace (which sets request.workspaceRole).
 */
export function requirePermission(permission: Permission) {
  return async function permissionGuard(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const role = request.workspaceRole as WorkspaceRole | undefined;

    if (!role) {
      throw request.server.httpErrors.forbidden(
        'Workspace context is required. Ensure resolveWorkspace runs first.'
      );
    }

    if (!roleHasPermission(role, permission)) {
      const allowed = ROLE_PERMISSIONS[permission].join(', ');
      throw request.server.httpErrors.forbidden(
        `Permission denied: '${permission}' requires one of [${allowed}]. Your role: ${role}`
      );
    }
  };
}

/**
 * requireAnyRole(['owner', 'admin'])
 *
 * Simpler guard when you just need role membership, not a named permission.
 */
export function requireAnyRole(allowedRoles: WorkspaceRole[]) {
  return async function roleGuard(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const role = request.workspaceRole as WorkspaceRole | undefined;

    if (!role) {
      throw request.server.httpErrors.forbidden('Workspace context required.');
    }

    if (!allowedRoles.includes(role)) {
      throw request.server.httpErrors.forbidden(
        `Access denied. Required: [${allowedRoles.join(', ')}]. Your role: ${role}`
      );
    }
  };
}
