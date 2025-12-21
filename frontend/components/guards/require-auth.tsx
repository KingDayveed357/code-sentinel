"use client";

import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, profileLoading } = useAuth();
  const router = useRouter();

  const authReady = !loading && !profileLoading;

  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      router.replace("/");
    }
  }, [authReady, user, router]);

  // ✅ SHOW SPINNER while loading or user/profile state isn't ready yet
  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If user still missing after loading → return spinner while redirecting
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return <>{children}</>;
}
