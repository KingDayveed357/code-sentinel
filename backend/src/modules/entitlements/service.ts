import type { FastifyInstance } from 'fastify';
import { PLAN_LIMITS, getLimits, isUnlimited } from './limits';

export class EntitlementsService {
  constructor(private fastify: FastifyInstance) {}

  /**
   * Get workspace subscription
   */
  async getWorkspaceSubscription(workspaceId: string) {
    const { data: subscription } = await this.fastify.supabase
      .from('subscriptions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .maybeSingle();

    return subscription;
  }

  /**
   * Helper to resolve plan from subscription
   */
  async getWorkspacePlan(workspaceId: string): Promise<string> {
    const subscription = await this.getWorkspaceSubscription(workspaceId);
    return subscription?.plan || 'Free';
  }

  /**
   * Check if workspace can perform an action (repositories)
   * @param workspaceId - The workspace ID
   */
  async checkRepositoryLimit(
    workspaceId: string,
    requestedCount: number
  ): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    remaining: number;
    unlimited: boolean;
    message?: string;
  }> {
    const plan = await this.getWorkspacePlan(workspaceId);
    const limits = getLimits(plan as any);
    const unlimited = isUnlimited(limits.repositories);
    
    const { count: currentCount } = await this.fastify.supabase
      .from('repositories')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    const current = currentCount || 0;
    const limit = unlimited ? Infinity : limits.repositories;
    const remaining = unlimited ? Infinity : limit - current;

    if (!unlimited && remaining < requestedCount) {
      return {
        allowed: false,
        current,
        limit,
        remaining,
        unlimited: false,
        message: `Repository limit reached. ${plan} plan allows ${limit} repositories.`,
      };
    }

    return {
      allowed: true,
      current,
      limit,
      remaining,
      unlimited,
    };
  }

  /**
   * Check monthly scan limit only (concurrent checked separately via database)
   * @param workspaceId - The workspace ID
   */
  async checkMonthlyLimit(
    workspaceId: string
  ): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    remaining: number;
    message?: string;
  }> {
    const plan = await this.getWorkspacePlan(workspaceId);
    const limits = getLimits(plan as any);
    const usage = await this.getOrCreateUsageRecord(workspaceId, plan);

    // Check monthly limit only
    const monthlyUnlimited = isUnlimited(limits.scans_per_month);
    if (!monthlyUnlimited && usage.scans_used >= limits.scans_per_month) {
      return {
        allowed: false,
        current: usage.scans_used,
        limit: limits.scans_per_month,
        remaining: 0,
        message: `Monthly scan limit reached. ${plan} plan allows ${limits.scans_per_month} scans per month.`,
      };
    }

    return {
      allowed: true,
      current: usage.scans_used,
      limit: monthlyUnlimited ? Infinity : limits.scans_per_month,
      remaining: monthlyUnlimited
        ? Infinity
        : limits.scans_per_month - usage.scans_used,
    };
  }

  /**
   * Increment scan usage when scan starts
   * @param workspaceId - The workspace ID
   */
  async trackScanStart(workspaceId: string, scanId: string): Promise<void> {
    const plan = await this.getWorkspacePlan(workspaceId);
    const { year, month } = this.getCurrentPeriod();
    
    // Only increment monthly counter
    // Concurrent scans are now tracked via database scan status
    let query = this.fastify.supabase
      .from('workspace_usage_tracking')
      .select('scans_used')
      .eq('workspace_id', workspaceId)
      .eq('period_year', year)
      .eq('period_month', month);

    const { data: usage } = await query.maybeSingle();

    if (usage) {
      // Update existing record
      await this.fastify.supabase
        .from('workspace_usage_tracking')
        .update({ scans_used: usage.scans_used + 1 })
        .eq('workspace_id', workspaceId)
        .eq('period_year', year)
        .eq('period_month', month);

    } else {
      // Create new record
      await this.getOrCreateUsageRecord(workspaceId, plan); 
      
      await this.fastify.supabase
        .from('workspace_usage_tracking')
        .update({ scans_used: 1 })
        .eq('workspace_id', workspaceId)
        .eq('period_year', year)
        .eq('period_month', month);
    }

    // Audit trail
    await this.logUsage(workspaceId, 'scan', scanId, 'start');
  }

  /**
   * Log scan completion for audit trail
   */
  async trackScanComplete(workspaceId: string, scanId: string): Promise<void> {
    // Only log completion for audit trail
    await this.logUsage(workspaceId, 'scan', scanId, 'complete');
  }

  /**
   * Get or create usage record for current month (lazy reset)
   */
  private async getOrCreateUsageRecord(workspaceId: string, plan: string) {
    const { year, month } = this.getCurrentPeriod();
    const limits = getLimits(plan as any);

    let query = this.fastify.supabase
      .from('workspace_usage_tracking')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('period_year', year)
      .eq('period_month', month);

    const { data: existingData } = await query.maybeSingle();

    if (existingData) return existingData;

    // Create new record for this month
    const { data: newRecord, error: insertError } = await this.fastify.supabase
      .from('workspace_usage_tracking')
      .insert({
        workspace_id: workspaceId,
        period_year: year,
        period_month: month,
        scans_used: 0,
        scans_limit: isUnlimited(limits.scans_per_month)
          ? -1
          : limits.scans_per_month,
        repositories_used: 0,
        repositories_limit: isUnlimited(limits.repositories)
          ? -1
          : limits.repositories,
        concurrent_scans: 0,
        concurrent_scans_limit: limits.concurrent_scans,
      })
      .select()
      .single();

    if (insertError) {
        // If conflict (race condition), retry fetch
        if (insertError.code === '23505') { // unique_violation
            const { data: retryData } = await this.fastify.supabase
                .from('workspace_usage_tracking')
                .select('*')
                .eq('workspace_id', workspaceId)
                .eq('period_year', year)
                .eq('period_month', month)
                .single();
            return retryData;
        }
        throw insertError;
    }
    return newRecord;
  }

  /**
   * Get current usage for workspace
   */
  async getWorkspaceUsage(workspaceId: string) {
    const plan = await this.getWorkspacePlan(workspaceId);
    const usage = await this.getOrCreateUsageRecord(workspaceId, plan);
    const limits = getLimits(plan as any);

    // Also get current repository count from DB as source of truth
    const { count: repoCount } = await this.fastify.supabase
        .from('repositories')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId);

    return {
      plan,
      limits: {
        repositories: isUnlimited(limits.repositories)
          ? null
          : limits.repositories,
        scans_per_month: isUnlimited(limits.scans_per_month)
          ? null
          : limits.scans_per_month,
        concurrent_scans: limits.concurrent_scans,
      },
      usage: {
        repositories: repoCount || 0,
        scans_this_month: usage.scans_used,
        concurrent_scans: usage.concurrent_scans,
      },
      remaining: {
        repositories: isUnlimited(limits.repositories)
          ? null
          : limits.repositories - (repoCount || 0),
        scans_this_month: isUnlimited(limits.scans_per_month)
          ? null
          : limits.scans_per_month - usage.scans_used,
        concurrent_scans: limits.concurrent_scans - usage.concurrent_scans,
      },
      period: {
        year: usage.period_year,
        month: usage.period_month,
        resets_at: this.getNextResetDate(),
      },
    };
  }

  /**
   * Check if plan has access to a feature
   */
  async hasFeature(workspaceId: string, feature: string): Promise<boolean> {
    const plan = await this.getWorkspacePlan(workspaceId);
    const { data } = await this.fastify.supabase
      .from('plan_entitlements')
      .select('enabled')
      .eq('plan', plan)
      .eq('feature', feature)
      .maybeSingle();

    return data?.enabled || false;
  }

  /**
   * Get all features for a plan
   */
  async getPlanFeatures(workspaceId: string): Promise<{ plan: string, features: Array<{ feature: string; enabled: boolean }> }> {
    const plan = await this.getWorkspacePlan(workspaceId);
    const { data, error } = await this.fastify.supabase
      .from('plan_entitlements')
      .select('feature, enabled')
      .eq('plan', plan);

    if (error) {
      throw error;
    }

    return { plan, features: data || [] };
  }

  private getCurrentPeriod() {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    };
  }

  private getNextResetDate(): string {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return next.toISOString();
  }

  private async logUsage(
    workspaceId: string,
    resourceType: string,
    resourceId: string,
    action: string
  ) {
    // Convert metadata to Record<string, any> to satisfy type requirements
    const metadata: Record<string, any> = { workspace_id: workspaceId };

    await this.fastify.supabase.from('workspace_usage_history').insert({
      workspace_id: workspaceId,
      resource_type: resourceType,
      resource_id: resourceId,
      action,
      metadata: metadata,
    });
  }
}