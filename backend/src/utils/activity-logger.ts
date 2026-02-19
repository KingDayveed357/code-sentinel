// src/utils/activity-logger.ts
/**
 * ActivityLogger — Centralised audit logging service.
 *
 * Records workspace-scoped events into `workspace_activity_log`.
 * All writes are fire-and-forget: failures are logged but never
 * propagate to the caller so they never break the happy path.
 *
 * Supported action strings (non-exhaustive):
 *   member.invited        member.added         member.removed
 *   member.role_changed   invitation.cancelled
 *   project.created       project.deleted      project.updated
 *   project.member_assigned  project.member_removed
 *   scan.started          scan.completed       scan.failed
 *   workspace.created     workspace.updated    workspace.deleted
 */

import type { FastifyInstance } from 'fastify';

export type ActivityAction =
  // Member events
  | 'member.invited'
  | 'member.added'
  | 'member.removed'
  | 'member.role_changed'
  | 'invitation.cancelled'
  // Project events
  | 'project.created'
  | 'project.deleted'
  | 'project.updated'
  | 'project.member_assigned'
  | 'project.member_removed'
  // Scan events
  | 'scan.started'
  | 'scan.completed'
  | 'scan.failed'
  | 'scan.cancelled'
  // Workspace events
  | 'workspace.created'
  | 'workspace.updated'
  | 'workspace.deleted'
  // Integration events
  | 'integration.connected'
  | 'integration.disconnected';

export interface LogActivityOptions {
  workspaceId: string;
  actorId: string | null;
  action: ActivityAction;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, any>;
}

/**
 * Log a workspace activity event.
 * Fire-and-forget — never throws.
 */
export async function logActivity(
  fastify: FastifyInstance,
  options: LogActivityOptions
): Promise<void> {
  const { workspaceId, actorId, action, resourceType, resourceId, metadata = {} } = options;

  try {
    await fastify.supabase.from('workspace_activity_log').insert({
      workspace_id: workspaceId,
      actor_id: actorId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata,
    });
  } catch (error) {
    // Never propagate — logging must not break business logic
    fastify.log.error(
      { error, workspaceId, action },
      '[ActivityLogger] Failed to write activity log entry'
    );
  }
}
