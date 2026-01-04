"use client";

import { use } from "react";
import { RequireTeamAccess } from "@/components/guards/require-team-access";

export default function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);

  return (
    <RequireTeamAccess teamId={teamId} checkSubscription={true}>
      {children}
    </RequireTeamAccess>
  );
}

