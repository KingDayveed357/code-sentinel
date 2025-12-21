"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

export function RequireOnboardingIncomplete({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isOnboardingComplete, loading, profileLoading } = useAuth();
  const router = useRouter();
  const hasRedirectedRef = useRef(false); 

  const authReady = !loading && !profileLoading;

  useEffect(() => {
    if (!authReady) return;
    if (hasRedirectedRef.current) return;

    if (!user) {
      hasRedirectedRef.current = true;
      router.replace("/");
    } else if (isOnboardingComplete) {
      hasRedirectedRef.current = true;
      router.replace("/dashboard");
    }
  }, [authReady, user, isOnboardingComplete, router]);

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || isOnboardingComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return <>{children}</>;
}
