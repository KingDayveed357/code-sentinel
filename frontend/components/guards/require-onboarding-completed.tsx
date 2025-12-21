"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

export function RequireOnboardingCompleted({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, profileLoading, isOnboardingComplete } = useAuth();
  const router = useRouter();

  // Wait for both user + profile to load
  const authReady = !loading && !profileLoading;

  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      router.replace("/");
    } else if (!isOnboardingComplete) {
      window.location.href = "/onboarding";
    }
  }, [authReady, user, isOnboardingComplete, router]);

  // 🔄 Show spinner while loading/stabilizing auth
  // if (!authReady) {
  //   return (
  //     <div className="flex min-h-screen items-center justify-center">
  //       <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  //     </div>
  //   );
  // }

  // 🔄 Show spinner while redirecting
  if (!user || !isOnboardingComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
