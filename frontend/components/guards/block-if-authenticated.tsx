"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

export function BlockIfAuthenticated({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, profileLoading } = useAuth();
  const router = useRouter();

  // Wait until both loading and profileLoading are done
  const authReady = !loading && !profileLoading;

  useEffect(() => {
    if (!authReady) return;

    if (user) {
      router.replace("/dashboard");
    }
  }, [authReady, user, router]);

  // Show spinner while waiting for auth state to stabilize
  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // If user exists, we already redirected → keep showing spinner
  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // User is unauthenticated → render children
  return <>{children}</>;
}
