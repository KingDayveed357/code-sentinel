"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { teamsApi } from "@/lib/api/teams";
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RequireTeamPlan } from "./require-team-plan";

interface RequireTeamAccessProps {
  children: React.ReactNode;
  teamId: string;
  /**
   * Minimum required role (default: any role)
   */
  requiredRole?: "owner" | "admin" | "developer" | "viewer";
  /**
   * If true, only owners can access (billing check applies)
   */
  ownerOnly?: boolean;
  /**
   * If true, check subscription status for owners
   */
  checkSubscription?: boolean;
}

const ROLE_HIERARCHY = {
  owner: 4,
  admin: 3,
  developer: 2,
  viewer: 1,
} as const;

export function RequireTeamAccess({
  children,
  teamId,
  requiredRole,
  ownerOnly = false,
  checkSubscription = true,
}: RequireTeamAccessProps) {
  const { user, loading, profileLoading } = useAuth();
  const { workspace, isTeamWorkspace, isPersonalWorkspace } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const [teamData, setTeamData] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authReady = !loading && !profileLoading;
  
  // If in personal workspace and user doesn't have Team/Enterprise plan, show unlock page
  const userPlan = user?.plan || "Free";
  const hasPaidPlan = ["Team", "Enterprise"].includes(userPlan);
  
  if (isPersonalWorkspace && !hasPaidPlan) {
    return <RequireTeamPlan />;
  }

  useEffect(() => {
    if (!authReady || !teamId) return;

    async function checkAccess() {
      try {
        setChecking(true);
        setError(null);

        // Step 1: Authentication
        if (!user) {
          router.replace("/");
          return;
        }

        // Step 2: Team Membership
        const data = await teamsApi.get(teamId);
        setTeamData(data.team);

        const userRole = data.team.role as keyof typeof ROLE_HIERARCHY;
        const isOwner = data.team.isOwner;

        // Step 3: Role Authorization
        if (ownerOnly && !isOwner) {
          setError("Only team owners can access this page.");
          return;
        }

        if (requiredRole) {
          const userLevel = ROLE_HIERARCHY[userRole] || 0;
          const requiredLevel = ROLE_HIERARCHY[requiredRole];
          if (userLevel < requiredLevel) {
            setError(
              `This page requires ${requiredRole} role or higher. You are: ${userRole}`
            );
            return;
          }
        }

        // Step 4: Subscription Enforcement (OWNER ONLY)
        // Note: Subscription check is disabled until billing is fully integrated
        // If user has Team/Enterprise plan, we assume they have billing (it's a paid plan)
        // TODO: Re-enable subscription check when billing is integrated
        if (checkSubscription && isOwner) {
          // For now, skip subscription_status check since billing isn't integrated
          // When billing is integrated, uncomment this:
          // const userPlan = user?.plan || "Free";
          // const hasPaidPlan = ["Team", "Enterprise"].includes(userPlan);
          // if (!hasPaidPlan) {
          //   const subscriptionStatus = data.team.subscription_status;
          //   if (!subscriptionStatus || subscriptionStatus !== "active") {
          //     router.push(`/dashboard/billing?teamId=${teamId}`);
          //     return;
          //   }
          // }
        }

        // All checks passed
        setChecking(false);
      } catch (err: any) {
        console.error("Team access check failed:", err);
        if (err.message?.includes("forbidden") || err.message?.includes("not found")) {
          setError("You don't have access to this team.");
        } else {
          setError("Failed to verify team access. Please try again.");
        }
        setChecking(false);
      }
    }

    checkAccess();
  }, [authReady, user, teamId, router, requiredRole, ownerOnly, checkSubscription]);

  // Show loading while auth is initializing
  if (!authReady || checking) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show error if access denied
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="max-w-md w-full space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button variant="outline" asChild>
            <Link href="/dashboard/teams">Back to Teams</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Access granted
  return <>{children}</>;
}

