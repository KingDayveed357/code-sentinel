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
    concurrent_scans: 10,
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

export function getLimits(plan: PlanName) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.Free;
}

export function isUnlimited(value: number): boolean {
  return value === Infinity;
}