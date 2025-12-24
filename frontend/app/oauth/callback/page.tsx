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
  const [status, setStatus] = useState<string>("Authenticating...");

  useEffect(() => {
    async function handleCallback() {
      try {
        setStatus("Checking authentication...");
        
        // 1. Check for OAuth provider error
        const errorParam = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        if (errorParam) {
          throw new Error(errorDescription || errorParam);
        }

        // 2. Wait for Supabase to process the OAuth callback
        // Supabase automatically exchanges the code for a session
        await new Promise(resolve => setTimeout(resolve, 1000));

        setStatus("Retrieving session...");

        // 3. Get the session (should be available now)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("Session error:", sessionError);
          throw new Error("Failed to establish session");
        }

        if (!session) {
          console.error("No session found");
          throw new Error("No session found. Please try signing in again.");
        }

        console.log("Session established:", {
          userId: session.user.id,
          hasProviderToken: !!session.provider_token,
        });

        // 4. Get provider token (GitHub access token)
        const providerToken = session.provider_token;
        if (!providerToken) {
          console.error("No provider token in session");
          throw new Error("GitHub access token not available");
        }

        setStatus("Creating your profile...");

        // 5. Send provider token to backend to complete OAuth flow
        // Backend will create user profile and store token in metadata
        const result = await authApi.completeOAuthCallback(providerToken);
        
        console.log("OAuth callback completed:", result);

        setStatus("Setting up your workspace...");

        // 6. Wait a moment for auth state to propagate
        await new Promise(resolve => setTimeout(resolve, 500));

        // 7. Check if onboarding is complete
        const { data: profile } = await supabase
          .from("users")
          .select("onboarding_completed")
          .eq("id", session.user.id)
          .single();

        console.log("User profile:", profile);

        // 8. Redirect based on onboarding status
        if (!profile?.onboarding_completed) {
          console.log("Redirecting to onboarding");
          router.replace("/onboarding");
        } else {
          console.log("Redirecting to dashboard");
          router.replace("/dashboard");
        }

      } catch (err) {
        console.error("OAuth callback error:", err);
        const errorMessage = err instanceof Error ? err.message : "Authentication failed";
        setError(errorMessage);

        // Redirect to home page after showing error
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
        <div className="text-center max-w-md p-6">
          <div className="mb-4">
            <svg className="h-12 w-12 text-red-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-red-600 mb-2">Authentication Failed</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
        <h1 className="text-2xl font-bold mb-2">Setting up your account</h1>
        <p className="text-gray-600">{status}</p>
      </div>
    </div>
  );
}