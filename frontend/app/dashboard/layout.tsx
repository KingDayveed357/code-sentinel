// frontend/app/dashboard/layout.tsx
import type React from "react"
import { DashboardShell } from "@/components/dashboard/layout/dashboard-shell"
import { RequireOnboardingCompleted } from "@/components/guards/require-onboarding-completed";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
  <RequireOnboardingCompleted>
  <DashboardShell>
    {children}
    </DashboardShell>
   </RequireOnboardingCompleted>
)}
