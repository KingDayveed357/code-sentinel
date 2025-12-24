// components/dashboard/import-banner.tsx
"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { GitBranch, X, ArrowRight, Building2, User, Shield } from "lucide-react";
import Link from "next/link";
import { onboardingApi } from "@/lib/api/onboarding";
import type { Workspace } from "@/lib/api/workspaces";

interface ImportBannerProps {
  onDismiss?: () => void;
  workspace?: Workspace | null;
}

export function ImportBanner({ onDismiss, workspace }: ImportBannerProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isDismissing, setIsDismissing] = useState(false);

  const isTeamWorkspace = workspace?.type === "team";

  const handleDismiss = async () => {
    try {
      setIsDismissing(true);
      
      // Call API to persist dismissal
      await onboardingApi.dismissBanner();
      
      setIsVisible(false);
      onDismiss?.();
    } catch (error) {
      console.error("Failed to dismiss banner:", error);
      // Still hide it locally even if API fails
      setIsVisible(false);
      onDismiss?.();
    } finally {
      setIsDismissing(false);
    }
  };

  if (!isVisible) return null;

  // Different variants for personal vs team workspaces
  const variant = isTeamWorkspace
    ? {
        color: "violet",
        icon: Building2,
        title: "Import repositories for your team",
        description: `${workspace?.name} has no repositories yet. Import projects to start scanning for your team.`,
        classes: {
          container: "border-l-violet-500 bg-violet-50 dark:bg-violet-950/30",
          icon: "text-violet-600 dark:text-violet-400",
          title: "text-violet-900 dark:text-violet-100",
          description: "text-violet-800 dark:text-violet-200",
          button: "bg-violet-600 hover:bg-violet-700 text-white",
          dismiss: "text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30",
        },
      }
    : {
        color: "blue",
        icon: Shield,
        title: "Get started with CodeSentinel",
        description: "You haven't imported any repositories yet. Import a project to start scanning for security vulnerabilities.",
        classes: {
          container: "border-l-blue-500 bg-blue-50 dark:bg-blue-950/30",
          icon: "text-blue-600 dark:text-blue-400",
          title: "text-blue-900 dark:text-blue-100",
          description: "text-blue-800 dark:text-blue-200",
          button: "bg-blue-600 hover:bg-blue-700 text-white",
          dismiss: "text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30",
        },
      };

  const Icon = variant.icon;

  return (
    <Alert
      className={`relative border-l-4 ${variant.classes.container} animate-in slide-in-from-top-2 duration-300`}
    >
      <Icon className={`h-5 w-5 ${variant.classes.icon}`} />

      <AlertDescription className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className={`font-medium ${variant.classes.title}`}>
              {variant.title}
            </p>
            {isTeamWorkspace && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300">
                Team Workspace
              </span>
            )}
          </div>
          <p className={`text-sm ${variant.classes.description}`}>
            {variant.description}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            asChild
            size="sm"
            className={variant.classes.button}
          >
            <Link href="/dashboard/projects">
              Import Repository
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            disabled={isDismissing}
            className={variant.classes.dismiss}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Dismiss</span>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}