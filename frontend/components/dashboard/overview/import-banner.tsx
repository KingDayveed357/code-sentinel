// components/dashboard/import-banner.tsx
"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { GitBranch, X, ArrowRight } from "lucide-react";
import Link from "next/link";
import { onboardingApi } from "@/lib/api/onboarding";

interface ImportBannerProps {
  onDismiss?: () => void;
}

export function ImportBanner({ onDismiss }: ImportBannerProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isDismissing, setIsDismissing] = useState(false);

  const handleDismiss = async () => {
    try {
      setIsDismissing(true);
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

  return (
    <Alert 
      className="relative border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-950/30 animate-in slide-in-from-top-2 duration-300"
    >
      <GitBranch className="h-5 w-5 text-blue-600 dark:text-blue-400" />
      
      <AlertDescription className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="font-medium text-blue-900 dark:text-blue-100">
            Get started with CodeSentinel
          </p>
          <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
            You haven't imported any repositories yet. Import a project to start scanning for security vulnerabilities.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
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
            className="text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Dismiss</span>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}