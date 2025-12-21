// =====================================================
// modules/vulnerabilities-team/service.ts
// Team-scoped vulnerability management
// =====================================================
import type { FastifyInstance } from 'fastify';

export interface VulnerabilityAssignment {
  id: string;
  vulnerability_id: string;
  vulnerability_type: 'sast' | 'sca' | 'secrets' | 'iac' | 'container';
  team_id: string;
  assigned_to: string | null;
  assigned_by: string | null;
  status: 'open' | 'in_progress' | 'fixed' | 'ignored';
  priority: 'critical' | 'high' | 'medium' | 'low' | null;
  notes: string | null;
  assigned_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export class VulnerabilityAssignmentService {
  constructor(private fastify: FastifyInstance) {}

  /**
   * Assign vulnerability to team member
   */
  async assignVulnerability(
    teamId: string,
    vulnerabilityId: string,
    vulnerabilityType: string,
    assignedTo: string | null,
    assignedBy: string,
    options?: {
      priority?: string;
      notes?: string;
    }
  ): Promise<VulnerabilityAssignment> {
    // Verify assigned_to is a team member
    if (assignedTo) {
      const { data: member } = await this.fastify.supabase
        .from('team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('user_id', assignedTo)
        .eq('status', 'active')
        .single();

      if (!member) {
        throw this.fastify.httpErrors.badRequest(
          'Assignee is not an active team member'
        );
      }
    }

    // Upsert assignment
    const { data, error } = await this.fastify.supabase
      .from('vulnerability_assignments')
      .upsert(
        {
          vulnerability_id: vulnerabilityId,
          vulnerability_type: vulnerabilityType,
          team_id: teamId,
          assigned_to: assignedTo,
          assigned_by: assignedBy,
          priority: options?.priority || null,
          notes: options?.notes || null,
          status: 'open',
        },
        {
          onConflict: 'vulnerability_id,vulnerability_type,team_id',
        }
      )
      .select()
      .single();

    if (error || !data) {
      this.fastify.log.error({ error }, 'Failed to assign vulnerability');
      throw this.fastify.httpErrors.internalServerError('Failed to assign vulnerability');
    }

    // Log activity
    await this.logActivity(teamId, assignedBy, 'vulnerability.assigned', 'vulnerability', vulnerabilityId, {
      vulnerability_type: vulnerabilityType,
      assigned_to: assignedTo,
    });

    return data as VulnerabilityAssignment;
  }

  /**
   * Update vulnerability status
   */
  async updateStatus(
    teamId: string,
    assignmentId: string,
    status: 'open' | 'in_progress' | 'fixed' | 'ignored',
    updatedBy: string,
    notes?: string
  ): Promise<VulnerabilityAssignment> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (notes) {
      updateData.notes = notes;
    }

    if (status === 'fixed' || status === 'ignored') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await this.fastify.supabase
      .from('vulnerability_assignments')
      .update(updateData)
      .eq('id', assignmentId)
      .eq('team_id', teamId)
      .select()
      .single();

    if (error || !data) {
      this.fastify.log.error({ error }, 'Failed to update vulnerability status');
      throw this.fastify.httpErrors.internalServerError('Failed to update status');
    }

    // Log activity
    await this.logActivity(teamId, updatedBy, 'vulnerability.status_changed', 'vulnerability', data.vulnerability_id, {
      old_status: status,
      new_status: status,
      notes,
    });

    return data as VulnerabilityAssignment;
  }

  /**
   * Get all vulnerabilities for team with assignments
   */
  async getTeamVulnerabilities(
    teamId: string,
    options: {
      assignedTo?: string;
      status?: string;
      severity?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    vulnerabilities: any[];
    total: number;
    page: number;
    pages: number;
  }> {
    const page = options.page || 1;
    const limit = options.limit || 50;

    // Get all scans for team repositories
    const { data: teamRepos } = await this.fastify.supabase
      .from('repositories')
      .select('id')
      .eq('team_id', teamId);

    if (!teamRepos || teamRepos.length === 0) {
      return {
        vulnerabilities: [],
        total: 0,
        page,
        pages: 0,
      };
    }

    const repoIds = teamRepos.map((r) => r.id);

    // Query each vulnerability table
    const tables = ['vulnerabilities_sast', 'vulnerabilities_sca', 'vulnerabilities_secrets', 'vulnerabilities_iac', 'vulnerabilities_container'];
    const allVulns: any[] = [];

    for (const table of tables) {
      let query = this.fastify.supabase
        .from(table)
        .select(`
          *,
          scans!inner(repository_id),
          vulnerability_assignments(*)
        `)
        .in('scans.repository_id', repoIds);

      if (options.severity) {
        query = query.eq('severity', options.severity);
      }

      const { data } = await query;

      if (data) {
        const type = table.replace('vulnerabilities_', '');
        allVulns.push(...data.map((v: any) => ({ ...v, type })));
      }
    }

    // Apply filters
    let filtered = allVulns;

    if (options.assignedTo) {
      filtered = filtered.filter((v) =>
        v.vulnerability_assignments?.some((a: any) => a.assigned_to === options.assignedTo)
      );
    }

    if (options.status) {
      filtered = filtered.filter((v) =>
        v.vulnerability_assignments?.some((a: any) => a.status === options.status)
      );
    }

    // Pagination
    const total = filtered.length;
    const pages = Math.ceil(total / limit);
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return {
      vulnerabilities: paginated,
      total,
      page,
      pages,
    };
  }

  /**
   * Get vulnerabilities assigned to a specific member
   */
  async getMemberVulnerabilities(
    teamId: string,
    memberId: string,
    status?: string
  ): Promise<VulnerabilityAssignment[]> {
    let query = this.fastify.supabase
      .from('vulnerability_assignments')
      .select('*')
      .eq('team_id', teamId)
      .eq('assigned_to', memberId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('assigned_at', { ascending: false });

    if (error) {
      this.fastify.log.error({ error }, 'Failed to get member vulnerabilities');
      throw this.fastify.httpErrors.internalServerError('Failed to load vulnerabilities');
    }

    return (data as VulnerabilityAssignment[]) || [];
  }

  private async logActivity(
    teamId: string,
    actorId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: any
  ) {
    await this.fastify.supabase.from('team_activity_log').insert({
      team_id: teamId,
      actor_id: actorId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata,
    });
  }
}

// =====================================================
// modules/repository-access/service.ts
// Repository-level access control
// =====================================================
export class RepositoryAccessService {
  constructor(private fastify: FastifyInstance) {}

  /**
   * Grant repository access to entire team
   */
  async grantTeamAccess(
    repositoryId: string,
    teamId: string,
    grantedBy: string
  ): Promise<void> {
    // Verify repository belongs to team
    const { data: repo } = await this.fastify.supabase
      .from('repositories')
      .select('id, team_id')
      .eq('id', repositoryId)
      .single();

    if (!repo || repo.team_id !== teamId) {
      throw this.fastify.httpErrors.notFound('Repository not found');
    }

    const { error } = await this.fastify.supabase
      .from('repository_access')
      .upsert({
        repository_id: repositoryId,
        team_id: teamId,
        access_scope: 'team',
        member_id: null,
      });

    if (error) {
      this.fastify.log.error({ error }, 'Failed to grant team access');
      throw this.fastify.httpErrors.internalServerError('Failed to grant access');
    }

    // Log activity
    await this.logActivity(teamId, grantedBy, 'repository.access_granted', 'repository', repositoryId, {
      access_scope: 'team',
    });
  }

  /**
   * Grant repository access to specific member
   */
  async grantMemberAccess(
    repositoryId: string,
    teamId: string,
    memberId: string,
    grantedBy: string
  ): Promise<void> {
    // Verify member belongs to team
    const { data: member } = await this.fastify.supabase
      .from('team_members')
      .select('id')
      .eq('id', memberId)
      .eq('team_id', teamId)
      .eq('status', 'active')
      .single();

    if (!member) {
      throw this.fastify.httpErrors.badRequest('Member not found');
    }

    const { error } = await this.fastify.supabase
      .from('repository_access')
      .upsert({
        repository_id: repositoryId,
        team_id: teamId,
        access_scope: 'member',
        member_id: memberId,
      });

    if (error) {
      this.fastify.log.error({ error }, 'Failed to grant member access');
      throw this.fastify.httpErrors.internalServerError('Failed to grant access');
    }

    // Log activity
    await this.logActivity(teamId, grantedBy, 'repository.access_granted', 'repository', repositoryId, {
      access_scope: 'member',
      member_id: memberId,
    });
  }

  /**
   * Revoke repository access
   */
  async revokeAccess(
    repositoryId: string,
    teamId: string,
    memberId: string | null,
    revokedBy: string
  ): Promise<void> {
    let query = this.fastify.supabase
      .from('repository_access')
      .delete()
      .eq('repository_id', repositoryId)
      .eq('team_id', teamId);

    if (memberId) {
      query = query.eq('member_id', memberId);
    } else {
      query = query.is('member_id', null);
    }

    const { error } = await query;

    if (error) {
      this.fastify.log.error({ error }, 'Failed to revoke access');
      throw this.fastify.httpErrors.internalServerError('Failed to revoke access');
    }

    // Log activity
    await this.logActivity(teamId, revokedBy, 'repository.access_revoked', 'repository', repositoryId, {
      member_id: memberId,
    });
  }

  /**
   * Get repositories accessible to a member
   */
  async getMemberRepositories(teamId: string, memberId: string): Promise<any[]> {
    const { data, error } = await this.fastify.supabase
      .from('repositories')
      .select(`
        *,
        repository_access!left(access_scope, member_id)
      `)
      .eq('team_id', teamId);

    if (error) {
      this.fastify.log.error({ error }, 'Failed to get member repositories');
      throw this.fastify.httpErrors.internalServerError('Failed to load repositories');
    }

    // Filter by access
    return (data || []).filter((repo: any) => {
      const access = repo.repository_access;
      if (!access || access.length === 0) return true; // No access control = all team members

      return access.some((a: any) => 
        a.access_scope === 'team' || 
        (a.access_scope === 'member' && a.member_id === memberId)
      );
    });
  }

  /**
   * Check if member has access to repository
   */
  async checkAccess(repositoryId: string, memberId: string): Promise<boolean> {
    const { data } = await this.fastify.supabase.rpc('check_repository_access', {
      user_uuid: memberId,
      repo_uuid: repositoryId,
    });

    return data || false;
  }

  private async logActivity(
    teamId: string,
    actorId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: any
  ) {
    await this.fastify.supabase.from('team_activity_log').insert({
      team_id: teamId,
      actor_id: actorId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata,
    });
  }
}