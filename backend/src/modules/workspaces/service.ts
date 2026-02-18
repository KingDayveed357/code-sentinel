// =====================================================
// modules/workspaces/service.ts
// Complete workspace-centric service layer
// =====================================================
import type { FastifyInstance } from 'fastify';
import type {
  Workspace,
  WorkspaceMember,
  WorkspaceInvitation,
  WorkspaceActivity,
  WorkspaceRole,
  WorkspaceWithRole,
  MemberWithUser,
} from './types';
import { generateSlug } from '../../utils/slug';
import { sendWorkspaceInvitationEmail } from '../../utils/email';
import * as crypto from 'crypto';

export class WorkspaceService {
  constructor(public fastify: FastifyInstance) {}

  /**
   * Log workspace activity
   */
  private async logActivity(
    workspaceId: string,
    actorId: string | null,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      await this.fastify.supabase.from('workspace_activity_log').insert({
        workspace_id: workspaceId,
        actor_id: actorId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        metadata,
      });
    } catch (error) {
      this.fastify.log.error(
        { error, workspaceId, action },
        'Failed to log workspace activity'
      );
    }
  }

  /**
   * Get all workspaces accessible to a user
   */
  async getUserWorkspaces(userId: string): Promise<WorkspaceWithRole[]> {
    // Get personal workspace
    const { data: personalWorkspace } = await this.fastify.supabase
      .from('workspaces')
      .select('*')
      .eq('owner_id', userId)
      .eq('type', 'personal')
      .single();

    const workspaces: WorkspaceWithRole[] = [];

    // Add personal workspace with owner role
    if (personalWorkspace) {
      workspaces.push({
        ...(personalWorkspace as Workspace),
        role: 'owner',
        memberCount: 1,
      });
    }

    // Get team workspaces where user is a member
    const { data: memberships } = await this.fastify.supabase
      .from('workspace_members')
      .select('workspace_id, role, workspaces!inner(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('workspaces.type', 'team');

    if (memberships && memberships.length > 0) {
      // Filter memberships based on workspace status
      const activeMemberships = memberships.filter((m: any) => {
        const ws = m.workspaces as Workspace;
        // Allow if active/free OR if pending/expired but user is owner (so they can pay/manage)
        // Actually, preventing access to expired is good, but owner needs to see it to renew.
        return ws.plan === 'free' || 
               ws.billing_status === 'active' || 
               (['pending', 'expired'].includes(ws.billing_status) && m.role === 'owner');
      });

      if (activeMemberships.length > 0) {
        // Get member counts for valid workspaces
        const workspaceIds = activeMemberships.map((m: any) => m.workspace_id);
        const { data: memberCounts } = await this.fastify.supabase
          .from('workspace_members')
          .select('workspace_id')
          .in('workspace_id', workspaceIds)
          .eq('status', 'active');

        const countsByWorkspace: Record<string, number> = {};
        (memberCounts || []).forEach((mc: any) => {
          countsByWorkspace[mc.workspace_id] =
            (countsByWorkspace[mc.workspace_id] || 0) + 1;
        });

        activeMemberships.forEach((membership: any) => {
          workspaces.push({
            ...(membership.workspaces as Workspace),
            role: membership.role as WorkspaceRole,
            memberCount: countsByWorkspace[membership.workspace_id] || 1,
          });
        });
      }
    }

    return workspaces;
  }



  /**
   * Get workspace by ID with user's role
   */
  async getWorkspaceWithRole(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceWithRole> {
    const { data: workspace, error } = await this.fastify.supabase
      .from('workspaces')
      .select('*')
      .eq('id', workspaceId)
      .single();

    if (error || !workspace) {
      throw this.fastify.httpErrors.notFound('Workspace not found');
    }

    // Check if personal workspace
    if (workspace.type === 'personal') {
      if (workspace.owner_id !== userId) {
        throw this.fastify.httpErrors.forbidden(
          'You do not have access to this workspace'
        );
      }
      return { ...(workspace as Workspace), role: 'owner', memberCount: 1 };
    }

    // Check team workspace membership
    const { data: membership } = await this.fastify.supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!membership) {
      throw this.fastify.httpErrors.forbidden(
        'You are not a member of this workspace'
      );
    }

    return {
      ...(workspace as Workspace),
      role: membership.role as WorkspaceRole,
    };
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(
    userId: string,
    data: {
      name: string;
      type: 'personal' | 'team';
      plan?: string;
    }
  ): Promise<Workspace> {
    const slug = generateSlug(data.name);

    // Check slug uniqueness
    const { data: existing } = await this.fastify.supabase
      .from('workspaces')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existing) {
      throw this.fastify.httpErrors.conflict(
        'A workspace with this name already exists'
      );
    }

    // Create workspace
    const { data: workspace, error } = await this.fastify.supabase
      .from('workspaces')
      .insert({
        name: data.name,
        slug,
        type: data.type,
        owner_id: userId,
        plan: data.plan || (data.type === 'personal' ? 'Free' : 'Team'),
        billing_status: data.type === 'personal' ? 'active' : 'pending', // Personal is free (active), Team is pending initially
        expires_at: data.type === 'team' ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
        settings: {},
      })
      .select()
      .single();

    if (error || !workspace) {
      this.fastify.log.error({ error }, 'Failed to create workspace');
      throw this.fastify.httpErrors.internalServerError(
        'Failed to create workspace'
      );
    }

    // For team workspaces, add creator as owner member
    if (data.type === 'team') {
      await this.addMember(workspace.id, userId, 'owner', userId);
    }

    // Log workspace creation
    await this.logActivity(
      workspace.id,
      userId,
      'workspace.created',
      'workspace',
      workspace.id,
      { workspace_name: data.name, type: data.type }
    );

    return workspace as Workspace;
  }

  /**
   * Bootstrap workspace - ensures user has a personal workspace
   * Creates one if it doesn't exist, returns existing one if it does
   */
  async bootstrapWorkspace(userId: string): Promise<Workspace> {
    // Check if user already has a personal workspace
    const { data: existingWorkspace } = await this.fastify.supabase
      .from('workspaces')
      .select('*')
      .eq('owner_id', userId)
      .eq('type', 'personal')
      .single();

    if (existingWorkspace) {
      return existingWorkspace as Workspace;
    }

    // Get user profile to use their name
    const { data: profile } = await this.fastify.supabase
      .from('users')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    const userName = profile?.full_name || profile?.email?.split('@')[0] || 'My';
    const workspaceName = `${userName}'s Workspace`;

    // Create personal workspace
    return this.createWorkspace(userId, {
      name: workspaceName,
      type: 'personal',
      plan: 'Free',
    });
  }

  /**
   * Update workspace
   */
  async updateWorkspace(
    workspaceId: string,
    userId: string,
    data: { name?: string; settings?: Record<string, any> }
  ): Promise<Workspace> {
    const workspace = await this.getWorkspaceWithRole(workspaceId, userId);

    if (workspace.role !== 'owner') {
      throw this.fastify.httpErrors.forbidden(
        'Only workspace owners can update workspace settings'
      );
    }

    const updates: any = {};

    if (data.name) {
      const slug = generateSlug(data.name);
      const { data: existing } = await this.fastify.supabase
        .from('workspaces')
        .select('id')
        .eq('slug', slug)
        .neq('id', workspaceId)
        .single();

      if (existing) {
        throw this.fastify.httpErrors.conflict(
          'A workspace with this name already exists'
        );
      }

      updates.name = data.name;
      updates.slug = slug;
    }

    if (data.settings) {
      updates.settings = data.settings;
    }

    const { data: updated, error } = await this.fastify.supabase
      .from('workspaces')
      .update(updates)
      .eq('id', workspaceId)
      .select()
      .single();

    if (error || !updated) {
      throw this.fastify.httpErrors.internalServerError(
        'Failed to update workspace'
      );
    }

    await this.logActivity(
      workspaceId,
      userId,
      'workspace.updated',
      'workspace',
      workspaceId,
      { updates }
    );

    return updated as Workspace;
  }

  /**
   * Delete workspace
   */
  async deleteWorkspace(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.getWorkspaceWithRole(workspaceId, userId);

    if (workspace.role !== 'owner') {
      throw this.fastify.httpErrors.forbidden(
        'Only workspace owners can delete the workspace'
      );
    }

    if (workspace.type === 'personal') {
      throw this.fastify.httpErrors.badRequest(
        'Cannot delete personal workspace'
      );
    }

    await this.logActivity(
      workspaceId,
      userId,
      'workspace.deleted',
      'workspace',
      workspaceId,
      { workspace_name: workspace.name }
    );

    const { error } = await this.fastify.supabase
      .from('workspaces')
      .delete()
      .eq('id', workspaceId);

    if (error) {
      throw this.fastify.httpErrors.internalServerError(
        'Failed to delete workspace'
      );
    }
  }

  /**
   * Get workspace members
   */
  async getMembers(workspaceId: string): Promise<MemberWithUser[]> {
    const { data: workspace } = await this.fastify.supabase
      .from('workspaces')
      .select('type, owner_id')
      .eq('id', workspaceId)
      .single();

    if (!workspace) {
      throw this.fastify.httpErrors.notFound('Workspace not found');
    }

    // Personal workspace: return owner only
    if (workspace.type === 'personal') {
      const { data: owner } = await this.fastify.supabase
        .from('users')
        .select('id, email, full_name, avatar_url')
        .eq('id', workspace.owner_id)
        .single();

      if (!owner) return [];

      return [
        {
          id: `personal-${workspace.owner_id}`,
          workspace_id: workspaceId,
          user_id: owner.id,
          role: 'owner',
          status: 'active',
          joined_at: new Date().toISOString(),
          user: owner,
        } as MemberWithUser,
      ];
    }

    // Team workspace: get all members
    const { data: members } = await this.fastify.supabase
      .from('workspace_members')
      .select(
        `
        *,
        user:users!workspace_members_user_id_fkey (
          id,
          email,
          full_name,
          avatar_url
        )
      `
      )
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .order('joined_at', { ascending: true });

    return (members || []) as MemberWithUser[];
  }

  /**
   * Add member to workspace
   */
  async addMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    invitedBy: string
  ): Promise<WorkspaceMember> {
    const { data, error } = await this.fastify.supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        role,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw this.fastify.httpErrors.conflict(
          'User is already a workspace member'
        );
      }
      throw this.fastify.httpErrors.internalServerError(
        'Failed to add member'
      );
    }

    // Fetch user for logging email
    const { data: userData } = await this.fastify.supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    await this.logActivity(
      workspaceId,
      invitedBy,
      'member.added',
      'workspace_member',
      data.id,
      { user_id: userId, role, email: userData?.email }
    );

    return data as WorkspaceMember;
  }

  /**
   * Invite user to workspace
   */
  async inviteMember(
    workspaceId: string,
    email: string,
    role: WorkspaceRole,
    invitedBy: string
  ): Promise<WorkspaceInvitation> {
    const workspace = await this.getWorkspaceWithRole(workspaceId, invitedBy);

    if (workspace.type === 'personal') {
      throw this.fastify.httpErrors.badRequest(
        'Cannot invite members to personal workspace'
      );
    }

    if (!['owner', 'admin'].includes(workspace.role)) {
      throw this.fastify.httpErrors.forbidden(
        'Only owners and admins can invite members'
      );
    }

    // Check if user already exists and is a member
    const { data: existingUser } = await this.fastify.supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      const { data: existingMember } = await this.fastify.supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', existingUser.id)
        .single();

      if (existingMember) {
        throw this.fastify.httpErrors.conflict(
          'User is already a workspace member'
        );
      }
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');

    // Create invitation
    const { data: invitation, error } = await this.fastify.supabase
      .from('workspace_invitations')
      .insert({
        workspace_id: workspaceId,
        email,
        role,
        invited_by: invitedBy,
        token,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw this.fastify.httpErrors.conflict(
          'Invitation already exists for this email'
        );
      }
      throw this.fastify.httpErrors.internalServerError(
        'Failed to create invitation'
      );
    }

    // Get inviter's name for email
    const { data: inviter } = await this.fastify.supabase
      .from('users')
      .select('full_name, email')
      .eq('id', invitedBy)
      .single();

    const inviterName = inviter?.full_name || inviter?.email || 'A team member';

    // Send email with inviter name and role
    // Note: Email failure should not block invitation creation
    try {
      await sendWorkspaceInvitationEmail(
        email,
        invitation.token,
        workspaceId,
        workspace.name,
        inviterName,
        role
      );
    } catch (emailError) {
      // Log the error but don't fail the invitation
      this.fastify.log.error(
        { error: emailError, email, workspaceId },
        'Failed to send invitation email, but invitation was created'
      );
      console.error('⚠️  Email sending failed, but invitation was created successfully');
      console.error('The user can still be invited manually using the token from the database');
    }

    await this.logActivity(
      workspaceId,
      invitedBy,
      'member.invited',
      'workspace_invitation',
      invitation.id,
      { email, role }
    );

    return invitation as WorkspaceInvitation;
  }

  /**
   * Accept workspace invitation
   */
  async acceptInvitation(
    token: string,
    userId: string
  ): Promise<{ workspace: Workspace; member: WorkspaceMember }> {
    const { data: invitation, error } = await this.fastify.supabase
      .from('workspace_invitations')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .single();

    if (error || !invitation) {
      throw this.fastify.httpErrors.notFound(
        'Invitation not found or already used'
      );
    }

    if (new Date(invitation.expires_at) < new Date()) {
      throw this.fastify.httpErrors.badRequest('Invitation has expired');
    }

    const { data: user } = await this.fastify.supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    if (!user || user.email !== invitation.email) {
      throw this.fastify.httpErrors.forbidden(
        'This invitation is not for your account'
      );
    }

    // Add member (handle idempotency)
    let member;
    try {
      member = await this.addMember(
        invitation.workspace_id,
        userId,
        invitation.role as WorkspaceRole,
        invitation.invited_by
      );
    } catch (error: any) {
      // If user is already a member, just fetch them and proceed
      if (error.statusCode === 409 || error.code === '409') { // Fastify error or code
        const { data: existingMember } = await this.fastify.supabase
          .from('workspace_members')
          .select('*')
          .eq('workspace_id', invitation.workspace_id)
          .eq('user_id', userId)
          .single();
          
        if (!existingMember) {
           throw error; // Should not happen if 409, but safety check
        }
        member = existingMember;
      } else {
        throw error;
      }
    }

    // Mark invitation as accepted
    await this.fastify.supabase
      .from('workspace_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invitation.id);

    // Get workspace
    const { data: workspace } = await this.fastify.supabase
      .from('workspaces')
      .select('*')
      .eq('id', invitation.workspace_id)
      .single();

    return {
      workspace: workspace as Workspace,
      member,
    };
  }

  /**
   * Remove member from workspace
   */
  async removeMember(
    workspaceId: string,
    memberId: string,
    removedBy: string
  ): Promise<void> {
    const workspace = await this.getWorkspaceWithRole(workspaceId, removedBy);

    if (workspace.type === 'personal') {
      throw this.fastify.httpErrors.badRequest(
        'Cannot remove members from personal workspace'
      );
    }

    if (!['owner', 'admin'].includes(workspace.role)) {
      throw this.fastify.httpErrors.forbidden(
        'Only owners and admins can remove members'
      );
    }

    const { data: member } = await this.fastify.supabase
      .from('workspace_members')
      .select('user_id, role')
      .eq('id', memberId)
      .eq('workspace_id', workspaceId)
      .single();

    if (!member) {
      throw this.fastify.httpErrors.notFound('Member not found');
    }

    if (member.user_id === removedBy) {
      throw this.fastify.httpErrors.badRequest(
        'Cannot remove yourself from workspace'
      );
    }

    if (member.role === 'owner') {
      throw this.fastify.httpErrors.forbidden('Cannot remove workspace owner');
    }

    const { error } = await this.fastify.supabase
      .from('workspace_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      throw this.fastify.httpErrors.internalServerError(
        'Failed to remove member'
      );
    }

    await this.logActivity(
      workspaceId,
      removedBy,
      'member.removed',
      'workspace_member',
      memberId,
      { removed_user_id: member.user_id, removed_role: member.role }
    );
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    workspaceId: string,
    memberId: string,
    newRole: WorkspaceRole,
    updatedBy: string
  ): Promise<WorkspaceMember> {
    const workspace = await this.getWorkspaceWithRole(workspaceId, updatedBy);

    if (workspace.role !== 'owner') {
      throw this.fastify.httpErrors.forbidden(
        'Only workspace owners can change member roles'
      );
    }

    if (newRole === 'owner') {
      throw this.fastify.httpErrors.badRequest(
        'Use transfer ownership endpoint instead'
      );
    }

    const { data: member } = await this.fastify.supabase
      .from('workspace_members')
      .select('user_id, role')
      .eq('id', memberId)
      .eq('workspace_id', workspaceId)
      .single();

    if (!member) {
      throw this.fastify.httpErrors.notFound('Member not found');
    }

    if (member.user_id === updatedBy) {
      throw this.fastify.httpErrors.badRequest('Cannot change your own role');
    }

    const { data: updated, error } = await this.fastify.supabase
      .from('workspace_members')
      .update({ role: newRole })
      .eq('id', memberId)
      .select()
      .single();

    if (error || !updated) {
      throw this.fastify.httpErrors.internalServerError(
        'Failed to update member role'
      );
    }

    await this.logActivity(
      workspaceId,
      updatedBy,
      'member.role_changed',
      'workspace_member',
      memberId,
      {
        user_id: member.user_id,
        old_role: member.role,
        new_role: newRole,
      }
    );

    return updated as WorkspaceMember;
  }



  /**
   * Preview a workspace invitation by token
   */
  async previewInvitation(token: string): Promise<WorkspaceInvitation> {
    const { data: invitation, error } = await this.fastify.supabase
      .from('workspace_invitations')
      .select('*, workspace:workspaces(name, slug), inviter:users!workspace_invitations_invited_by_fkey(full_name, email)')
      .eq('token', token)
      .single();

    if (error || !invitation) {
      throw this.fastify.httpErrors.notFound('Invitation not found or invalid');
    }

    if (new Date(invitation.expires_at) < new Date()) {
      throw this.fastify.httpErrors.gone('Invitation has expired');
    }

    if (invitation.status !== 'pending') {
         throw this.fastify.httpErrors.conflict(`Invitation is ${invitation.status}`);
    }

    return invitation as WorkspaceInvitation;
  }

  /**
   * Get pending invitations for workspace
   */
  async getInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const { data, error } = await this.fastify.supabase
      .from('workspace_invitations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      throw this.fastify.httpErrors.internalServerError(
        'Failed to fetch invitations'
      );
    }

    return (data || []) as WorkspaceInvitation[];
  }

  /**
   * Cancel invitation
   */
  async cancelInvitation(
    workspaceId: string,
    invitationId: string,
    cancelledBy: string
  ): Promise<void> {
    const workspace = await this.getWorkspaceWithRole(workspaceId, cancelledBy);

    if (!['owner', 'admin'].includes(workspace.role)) {
      throw this.fastify.httpErrors.forbidden(
        'Only owners and admins can cancel invitations'
      );
    }

    const { error } = await this.fastify.supabase
      .from('workspace_invitations')
      .delete()
      .eq('id', invitationId)
      .eq('workspace_id', workspaceId);

    if (error) {
      throw this.fastify.httpErrors.internalServerError(
        'Failed to cancel invitation'
      );
      
    }

    await this.logActivity(
      workspaceId,
      cancelledBy,
      'invitation.cancelled',
      'workspace_invitation',
      invitationId,
      {}
    );
  }

  /**
   * Get workspace activity log
   */
  async getActivity(
    workspaceId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<any[]> {
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    // Join with users table to get actor details
    const { data: activityLog, error } = await this.fastify.supabase
      .from('workspace_activity_log')
      .select('*, actor:users(email, full_name, avatar_url)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      this.fastify.log.error({ error, workspaceId }, 'Failed to fetch activity log');
      throw this.fastify.httpErrors.internalServerError(
        'Failed to fetch activity log'
      );
    }

    return activityLog || [];
  }

  /**
   * Check if user has a pending workspace
   */
  async hasPendingWorkspace(userId: string): Promise<Workspace | null> {
    const { data } = await this.fastify.supabase
      .from('workspaces')
      .select('*')
      .eq('owner_id', userId)
      .eq('billing_status', 'pending')
      .maybeSingle(); // Changed to maybeSingle to handle no result without error
    
    return data as Workspace | null;
  }

  /**
   * Cleanup pending workspaces (mark as expired)
   */
  async cleanupPendingWorkspaces(): Promise<number> {
    const now = new Date();

    // Find pending workspaces that have expired
    const { data: expiredWorkspaces, error: findError } = await this.fastify.supabase
      .from('workspaces')
      .select('id')
      .eq('billing_status', 'pending')
      .lt('expires_at', now.toISOString());

    if (findError || !expiredWorkspaces?.length) {
      return 0;
    }

    const ids = expiredWorkspaces.map(w => w.id);

    // Mark them as expired
    const { error: updateError, count } = await this.fastify.supabase
      .from('workspaces')
      .update({ billing_status: 'expired' })
      .in('id', ids);

    if (updateError) {
      this.fastify.log.error({ error: updateError }, 'Failed to expire pending workspaces');
      return 0;
    }

    return count || 0;
  }
}
