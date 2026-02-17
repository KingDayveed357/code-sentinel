// =====================================================
// ENTITLEMENTS API RESPONSE TYPES
// =====================================================
// Wave 1: Shared contract between backend and frontend
// This file defines the exact shape of entitlements API responses

export interface WorkspaceUsageResponse {
  plan: string;
  limits: {
    repositories: number | null; // null = unlimited
    scans_per_month: number | null; // null = unlimited
    concurrent_scans: number;
  };
  usage: {
    repositories: number;
    scans_this_month: number;
    concurrent_scans: number;
  };
  remaining: {
    repositories: number | null; // null = unlimited
    scans_this_month: number | null; // null = unlimited
    concurrent_scans: number;
  };
  period: {
    year: number;
    month: number;
    resets_at: string; // ISO 8601 timestamp
  };
}

export interface CheckLimitResponse {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  unlimited?: boolean;
  message?: string;
}

export interface PlanFeature {
  feature: string;
  enabled: boolean;
}

export interface PlanFeaturesResponse {
  plan: string;
  features: PlanFeature[];
}
