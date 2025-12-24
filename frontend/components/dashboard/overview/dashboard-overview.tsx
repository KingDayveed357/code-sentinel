// components/dashboard/dashboard-overview.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { GitBranch } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { onboardingApi } from "@/lib/api/onboarding";
import type { DashboardOverview as DashboardData } from "@/lib/api/dashboard";
import type { OnboardingState } from "@/lib/api/onboarding";

import { DashboardSkeleton } from "./dashboard-skeleton";
import { DashboardError } from "./dashboard-error";
import { ImportBanner } from "./import-banner";
import { StatsCards } from "./stats-cards";
import { SecurityScoreCard } from "./security-score-card";
import { CriticalVulnerabilitiesCard } from "./critical-vulnerabilities-card";
import { RecentScansCard } from "./recent-scans-card";
import { UpgradeModal } from "./upgrade-modal";
import { useWorkspace } from "@/hooks/use-workspace";

/**
 * Main Dashboard Overview Component with Workspace-Aware Banner
 */
export function DashboardOverview() {
  const { workspace } = useWorkspace();
  const [data, setData] = useState<DashboardData | null>(null);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<string>("Free");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Load data when component mounts or workspace changes
  const loadDashboardData = useCallback(async () => {
    if (!workspace) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch all data in parallel
      const [userProfile, overview, state] = await Promise.all([
        apiFetch("/auth/me", { requireAuth: true }),
        apiFetch("/dashboard/overview", { requireAuth: true }),
        onboardingApi.getState().catch(() => null),
      ]);

      setUserPlan(userProfile?.user?.plan || workspace?.plan || "Free");
      setData(overview);
      setOnboardingState(state);

      // Banner logic: Check per-workspace dismissal first
      const dismissedKey = `banner_dismissed_${workspace.id}`;
      const isLocallyDismissed = localStorage.getItem(dismissedKey) === "true";

      if (isLocallyDismissed) {
        setShowBanner(false);
        setBannerDismissed(true);
        return;
      }

      // Determine banner visibility
      const repoCount = overview?.stats?.repositories_scanned || 0;
      const skippedImport = state?.steps_skipped?.includes("import_repos");

      // Show banner if:
      // 1. Backend says should show, OR
      // 2. No repos AND user skipped import step
      const shouldShow =
        state?.should_show_import_banner ||
        (repoCount === 0 && skippedImport);

      setShowBanner(shouldShow);
      setBannerDismissed(false);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [workspace?.id]);

  // Reload when workspace changes
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleUpgradeRequired = useCallback(() => {
    setShowUpgradeModal(true);
  }, []);

  const handleBannerDismiss = useCallback(async () => {
    if (!workspace) return;

    // Store dismissal per workspace
    const dismissedKey = `banner_dismissed_${workspace.id}`;
    localStorage.setItem(dismissedKey, "true");

    setShowBanner(false);
    setBannerDismissed(true);
  }, [workspace?.id]);

  if (error) {
    return <DashboardError error={error} onRetry={loadDashboardData} />;
  }

  const canAccessTeam = userPlan === "Team" || userPlan === "Enterprise";

  return (
    <>
      <div className="space-y-6">
        {/* Import Banner - Workspace-specific */}
        {showBanner && !loading && !bannerDismissed && (
          <ImportBanner onDismiss={handleBannerDismiss} workspace={workspace} />
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-in fade-in duration-300">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              Dashboard
              {workspace && (
                <span className="text-xl font-normal text-muted-foreground ml-2">
                  — {workspace.name}
                </span>
              )}
            </h1>
            <p className="text-muted-foreground">
              Welcome back! Here's your security overview
              {workspace?.type === "team" ? " for this team workspace" : ""}.
            </p>
          </div>
          <Button
            asChild
            className="shadow-sm hover:shadow-md transition-all duration-200"
          >
            <Link href="/dashboard/projects">
              <GitBranch className="mr-2 h-4 w-4" />
              View All Projects
            </Link>
          </Button>
        </div>

        {/* Content - Show skeleton while loading */}
        {loading ? (
          <DashboardSkeleton />
        ) : data ? (
          <>
            {/* Stats Grid */}
            <StatsCards stats={data.stats} />

            {/* Main Content Grid */}
            <div className="grid gap-6 md:grid-cols-2 md:items-start">
              <SecurityScoreCard score={data.security_score} />
              <CriticalVulnerabilitiesCard
                vulnerabilities={data.critical_vulnerabilities}
                canAccessTeam={canAccessTeam}
                onUpgradeRequired={handleUpgradeRequired}
              />
            </div>

            {/* Recent Scans */}
            <RecentScansCard scans={data.recent_scans} />
          </>
        ) : null}
      </div>

      {/* Upgrade Modal */}
      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        currentPlan={userPlan}
      />
    </>
  );
}