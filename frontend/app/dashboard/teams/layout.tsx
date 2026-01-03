"use client";

import { RequireTeamPlan } from "@/components/guards/require-team-plan";

export default function TeamsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireTeamPlan>
      {children}
    </RequireTeamPlan>
  );
}
