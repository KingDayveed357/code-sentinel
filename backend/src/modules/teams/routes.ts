// =====================================================
// modules/teams/routes.ts
// =====================================================
import type { FastifyInstance } from 'fastify';
import { TeamService } from './service';
import { TeamController } from './controller';
import { verifyAuth, loadProfile } from '../../middleware/auth';
import {
  requireAuth,
  requireProfile,
  requireOnboardingCompleted,
  requireTeamPlan,
} from '../../middleware/gatekeepers';
import { requireTeam, requireMinimumRole } from './middleware';

export default async function teamsRoutes(fastify: FastifyInstance) {
  const service = new TeamService(fastify);
  const controller = new TeamController(service);

  const basePreHandler = [
    verifyAuth,
    loadProfile,
    requireAuth,
    requireProfile,
    requireOnboardingCompleted,
    requireTeamPlan, 
  ];

  const teamPreHandler = [...basePreHandler, requireTeam];

  /**
   * POST /api/teams - Create team
   */
  fastify.post('/', { preHandler: basePreHandler }, (req, reply) =>
    controller.createTeam(req, reply)
  );

  /**
   * GET /api/teams - List user's teams
   */
  fastify.get('/', { preHandler: basePreHandler }, (req, reply) =>
    controller.listTeams(req, reply)
  );

  /**
   * GET /api/teams/:teamId - Get team details
   */
  fastify.get('/:teamId', { preHandler: teamPreHandler }, (req, reply) =>
    controller.getTeam(req, reply)
  );

  /**
   * POST /api/teams/:teamId/invite - Invite member (owner/admin only)
   */
  fastify.post(
    '/:teamId/invite',
    {
      preHandler: [...teamPreHandler, requireMinimumRole('admin')],
    },
    (req, reply) => controller.inviteMember(req, reply)
  );

  /**
   * POST /api/teams/invitations/:token/accept - Accept invitation
   */
  fastify.post('/invitations/:token/accept', { preHandler: [
    verifyAuth,
    loadProfile,
    requireAuth,
    requireProfile,
    requireOnboardingCompleted,

  ] }, (req, reply) =>
    controller.acceptInvitation(req, reply)
  );

  /**
   * DELETE /api/teams/:teamId/members/:memberId - Remove member (owner/admin)
   */
  fastify.delete(
    '/:teamId/members/:memberId',
    {
      preHandler: [...teamPreHandler, requireMinimumRole('admin')],
    },
    (req, reply) => controller.removeMember(req, reply)
  );

  /**
   * PATCH /api/teams/:teamId/members/:memberId/role - Update role (owner only)
   */
  fastify.patch(
    '/:teamId/members/:memberId/role',
    {
      preHandler: [...teamPreHandler, requireMinimumRole('owner')],
    },
    (req, reply) => controller.updateMemberRole(req, reply)
  );

  /**
   * GET /api/teams/:teamId/activity - Get activity log
   */
  fastify.get('/:teamId/activity', { preHandler: teamPreHandler }, (req, reply) =>
    controller.getActivity(req, reply)
  );
}