"use client";

// Note: Removed RequireTeamPlan - billing is team-scoped, not user-scoped
// Non-owners can access teams they're invited to without a paid plan

export default function TeamsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
