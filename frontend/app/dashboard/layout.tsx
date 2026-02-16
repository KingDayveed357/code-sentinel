// frontend/app/dashboard/layout.tsx
import type React from "react"
import { DashboardShell } from "@/components/dashboard/layout/dashboard-shell"
import { RequireOnboardingCompleted } from "@/components/guards/require-onboarding-completed";
import { ScanStatusBanner } from "@/components/scans/scan-status-banner";
import { WorkspaceRouteGuard } from "@/components/guards/workspace-route-guard";

import { TopProgressBar } from "@/components/ui/top-progress-bar";
import { PendingWorkspaceBanner } from "@/components/dashboard/pending-workspace-banner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <RequireOnboardingCompleted>
      <TopProgressBar />
      <DashboardShell>
        <WorkspaceRouteGuard>
          {children}
        </WorkspaceRouteGuard>
        <PendingWorkspaceBanner />
      </DashboardShell>
    </RequireOnboardingCompleted>
  )
}

