"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { authApi } from "@/lib/api/auth";
import { Loader2 } from "lucide-react";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      try {
        // 1. Check for OAuth provider error
        const errorParam = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        if (errorParam) {
          throw new Error(errorDescription || errorParam);
        }

        // 2. Get Supabase session
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          throw new Error("Failed to establish session");
        }

        const providerToken = session.provider_token;
        if (!providerToken) {
          throw new Error("GitHub access token not available");
        }

        // 3. Notify backend to finalize OAuth (store provider token, sync user, etc.)
        await authApi.completeOAuthCallback(providerToken);

        // 4. Allow auth context to refresh
        await new Promise(resolve => setTimeout(resolve, 500));

        // 5. Check onboarding status (NEW)
        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("onboarding_completed")
          .eq("id", session.user.id)
          .single();

        // If no profile or onboarding not done → send to onboarding
        if (profileError || !profile?.onboarding_completed) {
          router.replace("/onboarding");
          return;
        }

        // Otherwise → dashboard
        router.replace("/dashboard");

      } catch (err) {
        console.error("OAuth callback error:", err);
        setError(err instanceof Error ? err.message : "Authentication failed");

        setTimeout(() => {
          router.replace("/?error=oauth_failed");
        }, 3000);
      }
    }

    handleCallback();
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Authentication Failed</h1>
          <p className="text-gray-600">{error}</p>
          <p className="text-sm text-gray-500 mt-2">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
        <h1 className="text-2xl font-bold mb-2">Completing authentication...</h1>
        <p className="text-gray-600">Please wait while we set up your account.</p>
      </div>
    </div>
  );
}
