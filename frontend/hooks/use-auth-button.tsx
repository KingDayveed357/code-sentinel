// hooks/use-auth-button.ts
"use client";

import { useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";

export function useAuthButton() {
  const { user, loading, profileLoading, githubSignIn, isOnboardingComplete } = useAuth();
  const router = useRouter();

  const finalLoading = loading || profileLoading;

  const label = finalLoading
    ? "Loading..."
    : !user
      ? "Continue with GitHub"
      : isOnboardingComplete
        ? "Go to Dashboard"
        : "Finish Setting Up";

  const action = useCallback(() => {
    if (finalLoading) return;

    // Not authenticated -> Sign in with GitHub
    if (!user) return githubSignIn();

    // Authenticated but onboarding incomplete -> Go to onboarding
    if (!isOnboardingComplete) return router.push("/onboarding");

    // Authenticated and onboarding complete -> Go to dashboard
    return router.push("/dashboard");
  }, [finalLoading, user, githubSignIn, router, isOnboardingComplete]);

  return {
    label,
    action,
    loading: finalLoading,
    showGithubIcon: !user, // Show GitHub icon only when not authenticated
  };
}