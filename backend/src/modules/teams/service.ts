

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
   * Helper: Log team activity
   */
  private async logActivity(
    teamId: string,
    actorId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: any = {}
  ): Promise<void> {
    try {
      await this.fastify.supabase.from('team_activity_log').insert({
        team_id: teamId,
        actor_id: actorId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        metadata,
      });
    } catch (error) {
      this.fastify.log.error({ error, teamId, action }, 'Failed to log team activity');
      // Don't throw - activity logging should not break the main operation
    }
  }

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

    // Log team creation
    await this.logActivity(
      team.id,
      userId,
      'team.created',
      'team',
      team.id,
      { team_name: data.name }
    );

    // Create team workspace
    try {
      const { data: workspace, error: workspaceError } = await this.fastify.supabase
        .from('workspaces')
        .insert({
          name: `${data.name} Workspace`,
          slug: `team-${slug}`,
          type: 'team',
          owner_id: userId,
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
    // Query teams directly instead of using RPC to ensure consistent structure
    const { data: members, error: membersError } = await this.fastify.supabase
      .from('team_members')
      .select('role, team_id, teams!inner(id, name, slug, owner_id, plan, created_at, updated_at)')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (membersError) {
      this.fastify.log.error({ error: membersError, userId }, 'Failed to get user teams');
      throw this.fastify.httpErrors.internalServerError('Failed to load teams');
    }

    if (!members || members.length === 0) {
      return [];
    }

    // Get member counts for each team
    const teamIds = members.map((m: any) => m.team_id);
    const { data: memberCounts, error: countError } = await this.fastify.supabase
      .from('team_members')
      .select('team_id')
      .in('team_id', teamIds)
      .eq('status', 'active');

    if (countError) {
      this.fastify.log.warn({ error: countError }, 'Failed to get member counts');
    }

    // Count members per team
    const countsByTeam: Record<string, number> = {};
    (memberCounts || []).forEach((mc: any) => {
      countsByTeam[mc.team_id] = (countsByTeam[mc.team_id] || 0) + 1;
    });

    // Transform to expected format
    return members.map((member: any) => ({
      team: member.teams as Team,
      role: member.role as TeamRole,
      memberCount: countsByTeam[member.team_id] || 1,
    }));
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
 // ... existing code ...

  /**
   * Invite user to team
   */
  async inviteMember(
    teamId: string,
    email: string,
    role: 'admin' | 'developer' | 'viewer',
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

    // ✅ FIX: Check if team owner has team/enterprise plan (not the inviter)
    const { data: team } = await this.fastify.supabase
      .from('teams')
      .select('owner_id')
      .eq('id', teamId)
      .single();

    if (!team) {
      throw this.fastify.httpErrors.notFound('Team not found');
    }

    const { data: owner } = await this.fastify.supabase
      .from('users')
      .select('plan')
      .eq('id', team.owner_id)
      .single();

    if (!owner) {
      throw this.fastify.httpErrors.notFound('Team owner not found');
    }

    // ✅ FIX: Only require team plan for the owner, not the invitee
    const allowedPlans = ['Team', 'Enterprise'];
    if (!allowedPlans.includes(owner.plan)) {
      throw this.fastify.httpErrors.forbidden(
        'Team owner must have a Team or Enterprise plan to invite members'
      );
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

    // Log invitation
    await this.logActivity(
      teamId,
      invitedBy,
      'member.invited',
      'team_invitation',
      invitation.id,
      { email, role }
    );

    this.fastify.log.info({ teamId, email }, 'Team invitation sent');

    return invitation as TeamInvitation;
  }

  // /**
  //  * Accept team invitation
  //  * ✅ FIX: Remove team plan requirement for accepting invitations
  //  */
  // async acceptInvitation(token: string, userId: string): Promise<{
  //   team: Team;
  //   member: TeamMember;
  // }> {
  //   // ... existing validation code ...
    
  //   // ✅ FIX: Don't check user's plan - they can join if owner has team plan
  //   // The billing is handled by the team owner, not the member
    
  //   // ... rest of existing code ...
  // }

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

    // Log invitation acceptance
    await this.logActivity(
      invitation.team_id,
      userId,
      'member.invitation_accepted',
      'team_member',
      member.id,
      { email: invitation.email, role: invitation.role }
    );

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

    // Get member details for logging
    const { data: memberDetails } = await this.fastify.supabase
      .from('team_members')
      .select('user_id, role, users!inner(email, full_name)')
      .eq('id', memberId)
      .single();

    // Remove member
    const { error } = await this.fastify.supabase
      .from('team_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      this.fastify.log.error({ error }, 'Failed to remove member');
      throw this.fastify.httpErrors.internalServerError('Failed to remove member');
    }

    // Log member removal
    await this.logActivity(
      teamId,
      removedBy,
      'member.removed',
      'team_member',
      memberId,
      {
        removed_user_id: member.user_id,
        removed_user_email: (memberDetails as any)?.users?.email,
        removed_role: member.role,
      }
    );

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

    // Get member details for logging
    const { data: memberBefore } = await this.fastify.supabase
      .from('team_members')
      .select('role, user_id, users!inner(email, full_name)')
      .eq('id', memberId)
      .single();

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

    // Log role change
    await this.logActivity(
      teamId,
      updatedBy,
      'member.role_changed',
      'team_member',
      memberId,
      {
        user_id: data.user_id,
        user_email: (memberBefore as any)?.users?.email,
        old_role: memberBefore?.role,
        new_role: newRole,
      }
    );

    return data as TeamMember;
  }

  /**
   * Update team name
   */
  async updateTeamName(
    teamId: string,
    newName: string,
    updatedBy: string
  ): Promise<Team> {
    // Get current team
    const { data: team, error: teamError } = await this.fastify.supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      throw this.fastify.httpErrors.notFound('Team not found');
    }

    // Verify updater is owner
    if (team.owner_id !== updatedBy) {
      throw this.fastify.httpErrors.forbidden('Only team owner can rename the team');
    }

    const slug = generateSlug(newName);

    // Check slug uniqueness (excluding current team)
    const { data: existing } = await this.fastify.supabase
      .from('teams')
      .select('id')
      .eq('slug', slug)
      .neq('id', teamId)
      .single();

    if (existing) {
      throw this.fastify.httpErrors.conflict(
        'A team with this name already exists. Please choose a different name.'
      );
    }

    // Update team
    const { data: updatedTeam, error } = await this.fastify.supabase
      .from('teams')
      .update({
        name: newName,
        slug,
        updated_at: new Date().toISOString(),
      })
      .eq('id', teamId)
      .select()
      .single();

    if (error || !updatedTeam) {
      this.fastify.log.error({ error }, 'Failed to update team name');
      throw this.fastify.httpErrors.internalServerError('Failed to update team name');
    }

    // Log team rename
    await this.logActivity(
      teamId,
      updatedBy,
      'team.renamed',
      'team',
      teamId,
      { old_name: team.name, new_name: newName }
    );

    return updatedTeam as Team;
  }

  /**
   * Delete team (owner only)
   */
  async deleteTeam(teamId: string, deletedBy: string): Promise<void> {
    // Get team
    const { data: team, error: teamError } = await this.fastify.supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      throw this.fastify.httpErrors.notFound('Team not found');
    }

    // Verify deleter is owner
    if (team.owner_id !== deletedBy) {
      throw this.fastify.httpErrors.forbidden('Only team owner can delete the team');
    }

    // Log team deletion (before deleting)
    await this.logActivity(
      teamId,
      deletedBy,
      'team.deleted',
      'team',
      teamId,
      { team_name: team.name }
    );

    // Delete team (cascade will handle members, invitations, etc.)
    const { error } = await this.fastify.supabase
      .from('teams')
      .delete()
      .eq('id', teamId);

    if (error) {
      this.fastify.log.error({ error }, 'Failed to delete team');
      throw this.fastify.httpErrors.internalServerError('Failed to delete team');
    }

    this.fastify.log.info({ teamId }, 'Team deleted');
  }
}