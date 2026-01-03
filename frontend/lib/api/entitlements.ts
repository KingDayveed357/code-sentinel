
import {apiFetch} from "../api";

export interface PlanLimits {
  repositories: number | null;
  scans_per_month: number | null;
  concurrent_scans: number;
}

export interface PlanUsage {
  repositories: number;
  scans_this_month: number;
  concurrent_scans: number;
}

export interface PlanRemaining {
  repositories: number | null;
  scans_this_month: number | null;
  concurrent_scans: number;
}

export interface UsagePeriod {
  year: number;
  month: number;
  resets_at: string;
}

export interface Entitlements {
  plan: string;
  limits: PlanLimits;
  usage: PlanUsage;
  remaining: PlanRemaining;
  period: UsagePeriod;
}

export interface FeatureAccess {
  feature: string;
  enabled: boolean;
  plan: string;
}

export interface PlanFeatures {
  plan: string;
  features: Array<{ feature: string; enabled: boolean }>;
}

export const entitlementsApi = {
  getEntitlements: async (): Promise<Entitlements> => {
    const response = await apiFetch("/me/entitlements", {
      requireAuth: true,
    });
    return response.data;
  },

  checkFeature: async (feature: string): Promise<FeatureAccess> => {
    const response = await apiFetch(
      `/me/features?feature=${encodeURIComponent(feature)}`,
      { requireAuth: true }
    );
    return response.data;
  },

  getPlanFeatures: async (): Promise<PlanFeatures> => {
    const response = await apiFetch("/me/features", {
      requireAuth: true,
    });
    return response.data;
  },

  calculateUsagePercentage: (used: number, limit: number | null): number => {
    if (limit === null) return 0;
    return Math.min((used / limit) * 100, 100);
  },

  formatLimit: (value: number | null): string => {
    return value === null ? "Unlimited" : value.toLocaleString();
  },

  isApproachingLimit: (used: number, limit: number | null): boolean => {
    if (limit === null) return false;
    return (used / limit) >= 0.8;
  },

  isLimitExceeded: (used: number, limit: number | null): boolean => {
    if (limit === null) return false;
    return used >= limit;
  },
};

export class EntitlementsClient {
  private cache: Entitlements | null = null;
  private cacheTimestamp: number = 0;
  private cacheDuration: number = 5 * 60 * 1000; // 5 minutes

  async getEntitlements(forceRefresh: boolean = false): Promise<Entitlements> {
    const now = Date.now();
    
    if (!forceRefresh && this.cache && (now - this.cacheTimestamp) < this.cacheDuration) {
      return this.cache;
    }

    const entitlements = await entitlementsApi.getEntitlements();
    this.cache = entitlements;
    this.cacheTimestamp = now;
    
    return entitlements;
  }

  invalidateCache(): void {
    this.cache = null;
    this.cacheTimestamp = 0;
  }
}

export const entitlementsClient = new EntitlementsClient();
