export const PLAN_LIMITS = {
  Free: {
    repositories: 5,
    scans_per_month: 10,
    concurrent_scans: 1,
    auto_scan: false,
    team_members: 1,
    priority_support: false,
  },
  Dev: {
    repositories: 20,
    scans_per_month: 100,
    concurrent_scans: 3,
    auto_scan: true,
    team_members: 1,
    priority_support: false,
  },
  Team: {
    repositories: 100,
    scans_per_month: Infinity,
    concurrent_scans: 20,
    auto_scan: true,
    team_members: 10,
    priority_support: true,
  },
  Enterprise: {
    repositories: Infinity,
    scans_per_month: Infinity,
    concurrent_scans: 50,
    auto_scan: true,
    team_members: Infinity,
    priority_support: true,
  },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;
export type LimitKey = keyof typeof PLAN_LIMITS.Free;

const PLAN_NAME_MAP: Record<string, PlanName> = {
  free: "Free",
  dev: "Dev",
  team: "Team",
  enterprise: "Enterprise",
};

export function normalizePlanName(plan?: string | null): PlanName {
  if (!plan) return "Free";

  const normalized = PLAN_NAME_MAP[plan.trim().toLowerCase()];
  return normalized || "Free";
}

export function getLimits(plan?: string | null) {
  const normalizedPlan = normalizePlanName(plan);
  return PLAN_LIMITS[normalizedPlan];
}

export function isUnlimited(value: number): boolean {
  return value === Infinity;
}
