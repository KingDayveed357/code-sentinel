// components/dashboard/dashboard-overview.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { GitBranch } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
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
import { useWorkspaceChangeListener } from "@/hooks/use-workspace-change-listener";
import { useDashboardOverview, workspaceKeys } from "@/hooks/use-dashboard-data";

/**
 * Main Dashboard Overview Component with Workspace-Aware Banner
 * Uses React Query for proper workspace-aware data fetching and cache management
 */
export function DashboardOverview() {
  const { workspace, isSwitching } = useWorkspace();
  const [userPlan, setUserPlan] = useState<string>("Free");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Listen to workspace changes and invalidate queries
  useWorkspaceChangeListener();

  // Use React Query hook for workspace-aware dashboard data
  // This automatically handles workspace switches and prevents stale data
  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useDashboardOverview();

  // Fetch user profile and onboarding state separately
  const { data: userProfile } = useQuery({
    queryKey: workspace ? [...workspaceKeys.all(workspace.id), 'user-profile'] : ['user-profile'],
    queryFn: async () => {
      return apiFetch("/auth/me", { requireAuth: true });
    },
    enabled: !!workspace,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: onboardingState } = useQuery({
    queryKey: workspace ? [...workspaceKeys.all(workspace.id), 'onboarding'] : ['onboarding'],
    queryFn: async () => {
      return onboardingApi.getState();
    },
    enabled: !!workspace,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry if onboarding API fails
  });

  // Update user plan when profile loads
  useEffect(() => {
    if (userProfile?.user?.plan) {
      setUserPlan(userProfile.user.plan);
    } else if (workspace?.plan) {
      setUserPlan(workspace.plan);
    }
  }, [userProfile, workspace?.plan]);

  // Determine banner visibility based on workspace and data
  useEffect(() => {
    if (!workspace || !data || isLoading) {
      setShowBanner(false);
      return;
    }

    // Check per-workspace dismissal first
    const dismissedKey = `banner_dismissed_${workspace.id}`;
    const isLocallyDismissed = localStorage.getItem(dismissedKey) === "true";

    if (isLocallyDismissed) {
      setShowBanner(false);
      setBannerDismissed(true);
      return;
    }

    // Determine banner visibility
    const repoCount = data?.stats?.repositories_scanned || 0;
    const skippedImport = onboardingState?.steps_skipped?.includes("import_repos");

    // Show banner if:
    // 1. Backend says should show, OR
    // 2. No repos AND user skipped import step
    const shouldShow =
      onboardingState?.should_show_import_banner ||
      (repoCount === 0 && skippedImport);

    setShowBanner(shouldShow);
    setBannerDismissed(false);
  }, [workspace?.id, data, onboardingState]);

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

  // Determine loading state: loading OR switching workspace OR fetching new data
  const isDataLoading = isLoading || isSwitching || (isFetching && !data);

  // Get error message
  const error = queryError ? (queryError as Error).message || "Failed to load dashboard data" : null;

  if (error) {
    return <DashboardError error={error} onRetry={() => refetch()} />;
  }

  const canAccessTeam = userPlan === "Team" || userPlan === "Enterprise";

  return (
    <>
      <div className="space-y-6">
        {/* Import Banner - Workspace-specific */}
        {showBanner && !isDataLoading && !bannerDismissed && workspace && (
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

        {/* Content - Show skeleton while loading or switching workspace */}
        {isDataLoading || !workspace ? (
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