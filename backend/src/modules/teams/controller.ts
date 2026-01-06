// =====================================================
// modules/teams/controller.ts
// =====================================================
import { type FastifyRequest, type FastifyReply, fastify } from 'fastify';
import { TeamService } from './service';
import { z } from 'zod';

const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  plan: z.enum(['Team', 'Enterprise']).optional(),
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'developer', 'viewer']),
});

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'developer', 'viewer']),
});

export class TeamController {
  constructor(private service: TeamService) {}

  /**
   * POST /api/teams - Create team
   */
  async createTeam(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.profile!.id;
    const body = createTeamSchema.parse(request.body);

    const team = await this.service.createTeam(userId, body);

    return reply.status(201).send({
      success: true,
      team,
    });
  }

  /**
   * GET /api/teams - List user's teams
   * Returns canonical shape: { team_id, team_name, user_role, member_count }
   */
  async listTeams(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.profile!.id;

    const teams = await this.service.getUserTeams(userId);

    // Transform to canonical API shape
    // Handle both RPC return formats (nested or flat)
    const canonicalTeams = teams.map((item: any) => {
      // If RPC returns flat structure
      if (item.team_id || item.id) {
        return {
          team_id: item.team_id || item.id,
          team_name: item.team_name || item.name,
          user_role: item.role || item.user_role,
          member_count: item.member_count || item.memberCount || 0,
        };
      }
      
      // If RPC returns nested structure
      if (item.team) {
        return {
          team_id: item.team.id,
          team_name: item.team.name,
          user_role: item.role,
          member_count: item.memberCount || 0,
        };
      }

      // Fallback: log and return safe defaults
      request.server.log.warn({ item }, 'Unexpected team structure from RPC');
      return {
        team_id: item.id || 'unknown',
        team_name: item.name || 'Unknown Team',
        user_role: item.role || 'viewer',
        member_count: item.member_count || item.memberCount || 0,
      };
    });

    return reply.send({
      success: true,
      teams: canonicalTeams,
    });
  }

  /**
   * GET /api/teams/:teamId - Get team details
   */
  async getTeam(request: FastifyRequest, reply: FastifyReply) {
    const { id: teamId, role, isOwner } = request.team!;

    // Get full team details
    const { data: teamData, error } = await request.server.supabase
      .from('teams')
      .select('id, name, slug, owner_id, plan, created_at, updated_at')
      .eq('id', teamId)
      .single();
 

    if (error || !teamData) {
     request.server.log.error({ error, teamId }, 'Failed to load team');
      throw request.server.httpErrors.notFound('Team not found');
    }


    // Get team members
    const { data: members, error: membersError } = await request.server.supabase
      .from('team_members')
      .select('*, users!team_members_user_id_fkey(id, email, full_name, avatar_url)')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .order('joined_at', { ascending: false });

    if (membersError || !members) {
      request.server.log.error({ membersError, teamId }, 'Failed to load team members');
      throw request.server.httpErrors.internalServerError('Failed to load team members');
    }

    // Get pending invitations
    const { data: invitations } = await request.server.supabase
      .from('team_invitations')
      .select('*')
      .eq('team_id', teamId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

   return reply.send({
    success: true,
    team: {
      ...teamData,
      role,
      isOwner,
    },
    members: members || [],
    invitations: invitations || [],
  });
  }

  /**
   * POST /api/teams/:teamId/invite - Invite member
   */
  async inviteMember(request: FastifyRequest, reply: FastifyReply) {
    const teamId = request.team!.id;
    const userId = request.profile!.id;
    const body = inviteMemberSchema.parse(request.body);

    const invitation = await this.service.inviteMember(
      teamId,
      body.email,
      body.role,
      userId
    );

    return reply.status(201).send({
      success: true,
      invitation,
    });
  }

  /**
   * POST /api/teams/invitations/:token/accept - Accept invitation
   */
  async acceptInvitation(request: FastifyRequest, reply: FastifyReply) {
    const { token } = request.params as { token: string };
    const userId = request.profile!.id;

    const result = await this.service.acceptInvitation(token, userId);

    return reply.send({
      success: true,
      team: result.team,
      member: result.member,
    });
  }

  /**
   * DELETE /api/teams/:teamId/members/:memberId - Remove member
   */
  async removeMember(request: FastifyRequest, reply: FastifyReply) {
    const teamId = request.team!.id;
    const { memberId } = request.params as { memberId: string };
    const userId = request.profile!.id;

    await this.service.removeMember(teamId, memberId, userId);

    return reply.send({
      success: true,
      message: 'Member removed successfully',
    });
  }

  /**
   * PATCH /api/teams/:teamId/members/:memberId/role - Update member role
   */
  async updateMemberRole(request: FastifyRequest, reply: FastifyReply) {
    const teamId = request.team!.id;
    const { memberId } = request.params as { memberId: string };
    const userId = request.profile!.id;
    const body = updateRoleSchema.parse(request.body);

    const member = await this.service.updateMemberRole(
      teamId,
      memberId,
      body.role,
      userId
    );

    return reply.send({
      success: true,
      member,
    });
  }

  /**
   * PATCH /api/teams/:teamId - Update team (name only, owner only)
   */
  async updateTeam(request: FastifyRequest, reply: FastifyReply) {
    const teamId = request.team!.id;
    const userId = request.profile!.id;
    const body = z.object({ name: z.string().min(1).max(100) }).parse(request.body);

    const team = await this.service.updateTeamName(teamId, body.name, userId);

    return reply.send({
      success: true,
      team,
    });
  }

  /**
   * DELETE /api/teams/:teamId - Delete team (owner only)
   */
  async deleteTeam(request: FastifyRequest, reply: FastifyReply) {
    const teamId = request.team!.id;
    const userId = request.profile!.id;

    await this.service.deleteTeam(teamId, userId);

    return reply.send({
      success: true,
      message: 'Team deleted successfully',
    });
  }

  /**
   * GET /api/teams/:teamId/activity - Get team activity log
   */
  async getActivity(request: FastifyRequest, reply: FastifyReply) {
    const teamId = request.team!.id;
    const page = parseInt((request.query as any).page || '1');
    const limit = parseInt((request.query as any).limit || '50');

    const { data: activities, error } = await request.server.supabase
      .from('team_activity_log')
      .select('*, users!actor_id(name, email, avatar_url)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) {
      throw request.server.httpErrors.internalServerError('Failed to load activity');
    }

    const { count } = await request.server.supabase
      .from('team_activity_log')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId);

    return reply.send({
      success: true,
      activities: activities || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    });
  }
}
