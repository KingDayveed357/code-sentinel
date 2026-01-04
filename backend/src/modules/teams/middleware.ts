// =====================================================
// modules/teams/middleware.ts
// Team-aware middleware and gatekeepers
// =====================================================
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TeamRole } from './types';
import { ROLE_HIERARCHY } from './types';

declare module 'fastify' {
  interface FastifyRequest {
    team?: {
      id: string;
      role: TeamRole;
      isOwner: boolean;
    };
  }
}

/**
 * Middleware: Resolve team context from route params
 * Attaches team info to request
 */
export async function requireTeam(request: FastifyRequest, reply: FastifyReply) {
  const teamId = (request.params as any).teamId;

  if (!teamId) {
    throw request.server.httpErrors.badRequest('Team ID is required');
  }

  if (!request.profile) {
    throw request.server.httpErrors.unauthorized('Authentication required');
  }

  // Get team and verify membership
  const { data: member, error } = await request.server.supabase
    .from('team_members')
    .select('role, teams!inner(id, owner_id)')
    .eq('team_id', teamId)
    .eq('user_id', request.profile.id)
    .eq('status', 'active')
    .single();

  if (error || !member) {
    throw request.server.httpErrors.forbidden('You are not a member of this team');
  }

  // Get team subscription status (for owner-only billing checks)
  const { data: team } = await request.server.supabase
    .from('teams')
    .select('id, owner_id, subscription_status')
    .eq('id', teamId)
    .single();

  // Attach to request
  request.team = {
    id: teamId,
    role: member.role as TeamRole,
    isOwner: (member.teams as any).owner_id === request.profile.id,
  };

  // Store subscription status for billing checks
  (request.team as any).subscriptionStatus = team?.subscription_status || null;
}

/**
 * Gatekeeper: Require specific team role(s)
 * Must be used after requireTeam
 */
export function requireTeamRole(allowedRoles: TeamRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.team) {
      throw request.server.httpErrors.internalServerError('Team context not loaded');
    }

    if (!allowedRoles.includes(request.team.role)) {
      throw request.server.httpErrors.forbidden(
        `This action requires ${allowedRoles.join(' or ')} role. You are: ${request.team.role}`
      );
    }
  };
}

/**
 * Gatekeeper: Require minimum role level
 * owner > admin > developer
 */
export function requireMinimumRole(minimumRole: TeamRole) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.team) {
      throw request.server.httpErrors.internalServerError('Team context not loaded');
    }

    const userLevel = ROLE_HIERARCHY[request.team.role];
    const requiredLevel = ROLE_HIERARCHY[minimumRole];

    if (userLevel < requiredLevel) {
      throw request.server.httpErrors.forbidden(
        `This action requires at least ${minimumRole} role. You are: ${request.team.role}`
      );
    }
  };
}
