import type { FastifyInstance } from 'fastify';
import { PLAN_LIMITS, getLimits, isUnlimited } from './limits';

export class EntitlementsService {
  constructor(private fastify: FastifyInstance) {}

  /**
   * Check if user can perform an action (repositories)
   * @param userId - NOTE: In workspace-aware contexts, this is actually workspaceId
   *                  The parameter name is kept as userId for backward compatibility
   *                  during migration. Usage tracking tables still use user_id column.
   */
  async checkRepositoryLimit(
    userId: string,
    plan: string,
    requestedCount: number
  ): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    remaining: number;
    unlimited: boolean;
    message?: string;
  }> {
    const limits = getLimits(plan as any);
    const unlimited = isUnlimited(limits.repositories);

    // Get current count
    const { count: currentCount } = await this.fastify.supabase
      .from('repositories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

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
   * Check if user can start a scan
   * @param userId - NOTE: In workspace-aware contexts, this is actually workspaceId
   *                  The parameter name is kept as userId for backward compatibility
   *                  during migration. Usage tracking tables still use user_id column.
   * @deprecated Use checkMonthlyLimit() instead. Concurrent scans are now checked via direct database query.
   */
  async checkScanLimit(
    userId: string,
    plan: string
  ): Promise<{
    allowed: boolean;
    type: 'monthly' | 'concurrent';
    current: number;
    limit: number;
    remaining: number;
    message?: string;
  }> {
    const limits = getLimits(plan as any);
    const usage = await this.getOrCreateUsageRecord(userId, plan);

    // Check monthly limit first
    const monthlyUnlimited = isUnlimited(limits.scans_per_month);
    if (!monthlyUnlimited && usage.scans_used >= limits.scans_per_month) {
      return {
        allowed: false,
        type: 'monthly',
        current: usage.scans_used,
        limit: limits.scans_per_month,
        remaining: 0,
        message: `Monthly scan limit reached. ${plan} plan allows ${limits.scans_per_month} scans per month.`,
      };
    }

    // ✅ FIX: Removed concurrent limit check - now handled by direct database query
    // This prevents issues where the concurrent_scans counter gets out of sync

    return {
      allowed: true,
      type: 'monthly',
      current: usage.scans_used,
      limit: monthlyUnlimited ? Infinity : limits.scans_per_month,
      remaining: monthlyUnlimited
        ? Infinity
        : limits.scans_per_month - usage.scans_used,
    };
  }

  /**
   * Check monthly scan limit only (concurrent checked separately via database)
   * @param userId - NOTE: In workspace-aware contexts, this is actually workspaceId
   */
  async checkMonthlyLimit(
    userId: string,
    plan: string
  ): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    remaining: number;
    message?: string;
  }> {
    const limits = getLimits(plan as any);
    const usage = await this.getOrCreateUsageRecord(userId, plan);

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
   * @param userId - NOTE: In workspace-aware contexts, this is actually workspaceId
   *                  The parameter name is kept as userId for backward compatibility
   *                  during migration. Usage tracking tables still use user_id column.
   */
  async trackScanStart(userId: string, scanId: string): Promise<void> {
    const { year, month } = this.getCurrentPeriod();

    // ✅ FIX: Only increment monthly counter
    // Concurrent scans are now tracked via database scan status
    const { data: usage } = await this.fastify.supabase
      .from('usage_tracking')
      .select('scans_used')
      .eq('user_id', userId)
      .eq('period_year', year)
      .eq('period_month', month)
      .maybeSingle();

    if (usage) {
      // Update existing record
      await this.fastify.supabase
        .from('usage_tracking')
        .update({ scans_used: usage.scans_used + 1 })
        .eq('user_id', userId)
        .eq('period_year', year)
        .eq('period_month', month);
    } else {
      // Create new record
      await this.getOrCreateUsageRecord(userId, 'Free'); // Will create with scans_used: 0
      await this.fastify.supabase
        .from('usage_tracking')
        .update({ scans_used: 1 })
        .eq('user_id', userId)
        .eq('period_year', year)
        .eq('period_month', month);
    }

    // Audit trail
    await this.logUsage(userId, 'scan', scanId, 'start');
  }

  /**
   * Log scan completion for audit trail
   * @param userId - NOTE: In workspace-aware contexts, this is actually workspaceId
   *                  The parameter name is kept as userId for backward compatibility
   *                  during migration. Usage tracking tables still use user_id column.
   */
  async trackScanComplete(userId: string, scanId: string): Promise<void> {
    // ✅ FIX: Only log completion for audit trail
    // No counter decrement needed - concurrent scans tracked via database scan status
    await this.logUsage(userId, 'scan', scanId, 'complete');
  }

  /**
   * Get or create usage record for current month (lazy reset)
   */
  private async getOrCreateUsageRecord(userId: string, plan: string) {
    const { year, month } = this.getCurrentPeriod();
    const limits = getLimits(plan as any);

    const { data, error } = await this.fastify.supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId)
      .eq('period_year', year)
      .eq('period_month', month)
      .maybeSingle();

    if (data) return data;

    // Create new record for this month
    const { data: newRecord, error: insertError } = await this.fastify.supabase
      .from('usage_tracking')
      .insert({
        user_id: userId,
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

    if (insertError) throw insertError;
    return newRecord;
  }

  /**
   * Get current usage for user (for /me/entitlements)
   * @param userId - NOTE: In workspace-aware contexts, this is actually workspaceId
   *                  The parameter name is kept as userId for backward compatibility
   *                  during migration. Usage tracking tables still use user_id column.
   *                  TODO: Migrate usage_tracking and usage_history tables to use workspace_id.
   */
  async getUserUsage(userId: string, plan: string) {
    const usage = await this.getOrCreateUsageRecord(userId, plan);
    const limits = getLimits(plan as any);

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
        repositories: usage.repositories_used,
        scans_this_month: usage.scans_used,
        concurrent_scans: usage.concurrent_scans,
      },
      remaining: {
        repositories: isUnlimited(limits.repositories)
          ? null
          : limits.repositories - usage.repositories_used,
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
   * Check if user has access to a feature
   */
  async hasFeature(plan: string, feature: string): Promise<boolean> {
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
  async getPlanFeatures(plan: string): Promise<Array<{ feature: string; enabled: boolean }>> {
    const { data, error } = await this.fastify.supabase
      .from('plan_entitlements')
      .select('feature, enabled')
      .eq('plan', plan);

    if (error) {
      throw error;
    }

    return data || [];
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
    userId: string,
    resourceType: string,
    resourceId: string,
    action: string
  ) {
    await this.fastify.supabase.from('usage_history').insert({
      user_id: userId,
      resource_type: resourceType,
      resource_id: resourceId,
      action,
    });
  }
}