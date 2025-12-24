

// =====================================================
// modules/teams/service.ts
// =====================================================
import type { FastifyInstance } from 'fastify';
import type { Team, TeamMember, TeamInvitation, TeamRole } from './types';
import { generateSlug } from '../../utils/slug';
import { sendTeamInvitationEmail } from '../../utils/email';

export class TeamService {
  constructor(private fastify: FastifyInstance) {}

  /**
   * Create a new team
   * Automatically adds creator as owner
   */
  async createTeam(
    userId: string,
    data: {
      name: string;
      plan?: 'Team' | 'Enterprise';
    }
  ): Promise<Team> {
    const slug = generateSlug(data.name);

    // Check slug uniqueness
    const { data: existing } = await this.fastify.supabase
      .from('teams')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existing) {
      throw this.fastify.httpErrors.conflict(
        'A team with this name already exists. Please choose a different name.'
      );
    }

    // Create team
    const { data: team, error } = await this.fastify.supabase
      .from('teams')
      .insert({
        name: data.name,
        slug,
        owner_id: userId,
        plan: data.plan || 'Team',
        settings: {},
      })
      .select()
      .single();

    if (error || !team) {
      this.fastify.log.error({ error }, 'Failed to create team');
      throw this.fastify.httpErrors.internalServerError('Failed to create team');
    }

    // Add creator as owner
    await this.addMember(team.id, userId, 'owner', userId);

    // Create team workspace
    try {
      const { data: workspace, error: workspaceError } = await this.fastify.supabase
        .from('workspaces')
        .insert({
          name: `${data.name} Workspace`,
          slug: `team-${slug}`,
          type: 'team',
          team_id: team.id,
          plan: data.plan || 'Team',
          settings: {},
        })
        .select()
        .single();

      if (workspaceError || !workspace) {
        this.fastify.log.error({ workspaceError, teamId: team.id }, 'Failed to create team workspace');
        // Don't fail team creation if workspace creation fails - can be fixed later
      } else {
        this.fastify.log.info({ teamId: team.id, workspaceId: workspace.id }, 'Team workspace created');
      }
    } catch (error) {
      this.fastify.log.error({ error, teamId: team.id }, 'Error creating team workspace');
      // Continue - team creation succeeds even if workspace creation fails
    }

    this.fastify.log.info({ teamId: team.id, userId }, 'Team created');

    return team as Team;
  }

  /**
   * Get team by ID with member role
   */
  async getTeamWithRole(teamId: string, userId: string): Promise<{
    team: Team;
    role: TeamRole;
    isOwner: boolean;
  }> {
    const { data: team, error: teamError } = await this.fastify.supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      throw this.fastify.httpErrors.notFound('Team not found');
    }

    const { data: member, error: memberError } = await this.fastify.supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (memberError || !member) {
      throw this.fastify.httpErrors.forbidden('You are not a member of this team');
    }

    return {
      team: team as Team,
      role: member.role as TeamRole,
      isOwner: team.owner_id === userId,
    };
  }

  /**
   * Get all teams for a user
   */
  async getUserTeams(userId: string): Promise<
    Array<{
      team: Team;
      role: TeamRole;
      memberCount: number;
    }>
  > {
    const { data, error } = await this.fastify.supabase.rpc('get_user_teams', {
      user_uuid: userId,
    });

    if (error) {
      this.fastify.log.error({ error, userId }, 'Failed to get user teams');
      throw this.fastify.httpErrors.internalServerError('Failed to load teams');
    }

    return data || [];
  }

  /**
   * Add member to team
   */
  async addMember(
    teamId: string,
    userId: string,
    role: TeamRole,
    invitedBy: string
  ): Promise<TeamMember> {
    const { data, error } = await this.fastify.supabase
      .from('team_members')
      .insert({
        team_id: teamId,
        user_id: userId,
        role,
        status: 'active',
        invited_by: invitedBy,
        joined_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw this.fastify.httpErrors.conflict('User is already a team member');
      }
      this.fastify.log.error({ error }, 'Failed to add team member');
      throw this.fastify.httpErrors.internalServerError('Failed to add member');
    }

    return data as TeamMember;
  }

  /**
   * Invite user to team
   */
  async inviteMember(
    teamId: string,
    email: string,
    role: 'admin' | 'developer',
    invitedBy: string
  ): Promise<TeamInvitation> {
    // Validate inviter has permission
    const { data: inviter } = await this.fastify.supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', invitedBy)
      .eq('status', 'active')
      .single();

    if (!inviter || (inviter.role !== 'owner' && inviter.role !== 'admin')) {
      throw this.fastify.httpErrors.forbidden('Only owners and admins can invite members');
    }

    // Check if user already exists
    const { data: existingUser } = await this.fastify.supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      // Check if already a member
      const { data: existingMember } = await this.fastify.supabase
        .from('team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('user_id', existingUser.id)
        .single();

      if (existingMember) {
        throw this.fastify.httpErrors.conflict('User is already a team member');
      }
    }

    // Create invitation
    const { data: invitation, error } = await this.fastify.supabase
      .from('team_invitations')
      .insert({
        team_id: teamId,
        email,
        role,
        invited_by: invitedBy,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw this.fastify.httpErrors.conflict('Invitation already exists for this email');
      }
      this.fastify.log.error({ error }, 'Failed to create invitation');
      throw this.fastify.httpErrors.internalServerError('Failed to send invitation');
    }

    // Send email
    await sendTeamInvitationEmail(email, invitation.token, teamId);

    this.fastify.log.info({ teamId, email }, 'Team invitation sent');

    return invitation as TeamInvitation;
  }

  /**
   * Accept team invitation
   */
  async acceptInvitation(token: string, userId: string): Promise<{
    team: Team;
    member: TeamMember;
  }> {
    // Get invitation
    const { data: invitation, error: inviteError } = await this.fastify.supabase
      .from('team_invitations')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .single();

    if (inviteError || !invitation) {
      throw this.fastify.httpErrors.notFound('Invitation not found or already used');
    }

    if (new Date(invitation.expires_at) < new Date()) {
      throw this.fastify.httpErrors.badRequest('Invitation has expired');
    }

    // Get user email
    const { data: user } = await this.fastify.supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    if (!user || user.email !== invitation.email) {
      throw this.fastify.httpErrors.forbidden('This invitation is not for your account');
    }

    // Add member
    const member = await this.addMember(
      invitation.team_id,
      userId,
      invitation.role,
      invitation.invited_by
    );

    // Mark invitation as accepted
    await this.fastify.supabase
      .from('team_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invitation.id);

    // Get team
    const { data: team } = await this.fastify.supabase
      .from('teams')
      .select('*')
      .eq('id', invitation.team_id)
      .single();

    return {
      team: team as Team,
      member,
    };
  }

  /**
   * Remove member from team
   */
  async removeMember(teamId: string, memberId: string, removedBy: string): Promise<void> {
    // Get remover's role
    const { data: remover } = await this.fastify.supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', removedBy)
      .eq('status', 'active')
      .single();

    if (!remover) {
      throw this.fastify.httpErrors.forbidden('You are not a team member');
    }

    // Get member to remove
    const { data: member } = await this.fastify.supabase
      .from('team_members')
      .select('role, user_id')
      .eq('id', memberId)
      .eq('team_id', teamId)
      .single();

    if (!member) {
      throw this.fastify.httpErrors.notFound('Member not found');
    }

    // Can't remove owner
    if (member.role === 'owner') {
      throw this.fastify.httpErrors.forbidden('Cannot remove team owner');
    }

    // Only owner can remove admins
    if (member.role === 'admin' && remover.role !== 'owner') {
      throw this.fastify.httpErrors.forbidden('Only owner can remove admins');
    }

    // Can't remove yourself unless you're not the owner
    if (member.user_id === removedBy && remover.role === 'owner') {
      throw this.fastify.httpErrors.forbidden(
        'Owner cannot remove themselves. Transfer ownership first.'
      );
    }

    // Remove member
    const { error } = await this.fastify.supabase
      .from('team_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      this.fastify.log.error({ error }, 'Failed to remove member');
      throw this.fastify.httpErrors.internalServerError('Failed to remove member');
    }

    this.fastify.log.info({ teamId, memberId }, 'Team member removed');
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    teamId: string,
    memberId: string,
    newRole: TeamRole,
    updatedBy: string
  ): Promise<TeamMember> {
    // Get updater's role
    const { data: updater } = await this.fastify.supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', updatedBy)
      .eq('status', 'active')
      .single();

    if (!updater || updater.role !== 'owner') {
      throw this.fastify.httpErrors.forbidden('Only owner can change member roles');
    }

    // Can't change owner role
    if (newRole === 'owner') {
      throw this.fastify.httpErrors.forbidden('Use transfer ownership endpoint instead');
    }

    const { data, error } = await this.fastify.supabase
      .from('team_members')
      .update({ role: newRole })
      .eq('id', memberId)
      .eq('team_id', teamId)
      .select()
      .single();

    if (error || !data) {
      this.fastify.log.error({ error }, 'Failed to update member role');
      throw this.fastify.httpErrors.internalServerError('Failed to update role');
    }

    return data as TeamMember;
  }
}