// hooks/use-auth.tsx (SIMPLIFIED - Race conditions eliminated)
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { supabase, getCurrentSession } from "@/lib/supabase-client";
import { authApi } from "@/lib/api/auth";
import type { User, Session } from "@supabase/supabase-js";
import type { Workspace } from "@/lib/api/workspaces";
import { workspacesApi } from "@/lib/api/workspaces";

type AuthUser = User & {
  plan?: string;
  onboarding_completed?: boolean;
  full_name?: string;
  role?: string;
  avatar_url?: string;
};

interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  profileLoading: boolean;
  githubSignIn: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isOnboardingComplete: boolean;
  userPlan: string;
  canAccessTeam: boolean;
  workspaceId: string | null;
  workspace: Workspace | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  const isNavigatingRef = useRef(false);
  const profileFetchTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // Fetch profile from backend
  const fetchUserProfile = useCallback(async (accessToken?: string) => {
    try {
      const resp = await authApi.me();
      const maybeUser = (resp as any)?.user;
      if (!maybeUser) return null;
      return maybeUser as AuthUser;
    } catch (err) {
      console.error("fetchUserProfile error:", err);
      return null;
    }
  }, []);

  // Refresh user public method
  const refreshUser = useCallback(async () => {
    const curr = await getCurrentSession();
    if (!curr?.access_token) return;
    const profile = await fetchUserProfile(curr.access_token);
    if (!profile) return;
    setUser((prev) => {
      if (
        prev?.id === profile.id &&
        prev?.onboarding_completed === profile.onboarding_completed &&
        prev?.plan === profile.plan
      ) {
        return prev;
      }
      return profile;
    });
  }, [fetchUserProfile]);

  // GitHub OAuth Sign In
  const githubSignIn = useCallback(async () => {
    try {
      isNavigatingRef.current = true;
      const { url } = await authApi.githubOAuth();
      window.location.href = url;
    } catch (err) {
      console.error("GitHub OAuth error:", err);
      isNavigatingRef.current = false;
      throw err;
    }
  }, []);

  // Logout
  const logout = useCallback(async () => {
    try {
      isNavigatingRef.current = true;
      setUser(null);
      setSession(null);
      await supabase.auth.signOut();
      router.replace("/");
    } catch (err) {
      console.error("logout error:", err);
      router.replace("/");
    } finally {
      isNavigatingRef.current = false;
    }
  }, [router]);

  // ✅ SIMPLIFIED: No more race conditions or complex orchestration
  // The backend middleware handles everything automatically
  useEffect(() => {
    mountedRef.current = true;

    async function init() {
      setLoading(true);

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
          setUser(null);
          setProfileLoading(false);
          return;
        }

        setSession(session);
        setProfileLoading(true);

        // Step 1: Fetch user profile
        const profile = await fetchUserProfile(session.access_token);
        if (!mountedRef.current) return;
        if (profile) setUser(profile);

        // Step 2: Bootstrap workspace
        // ✅ CRITICAL: Backend middleware now handles:
        //   - Creating workspace if it doesn't exist
        //   - Creating GitHub integration if user has OAuth token
        //   - Race condition prevention
        // Frontend just calls one endpoint and everything is ready!
        const { workspace: activeWorkspace } = await workspacesApi.bootstrap();
        if (!mountedRef.current) return;
        if (activeWorkspace) {
          setWorkspace(activeWorkspace);
          localStorage.setItem('active_workspace_id', activeWorkspace.id);
        }

        // Step 3: Clean up OAuth token from URL (if present)
        // This happens AFTER bootstrap, which already handled integration creation
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('code') || urlParams.has('access_token')) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }

      } catch (err) {
        console.error('Auth init error:', err);
        if (mountedRef.current) {
          setUser(null);
          setWorkspace(null);
        }
      } finally {
        if (mountedRef.current) {
          setProfileLoading(false);
          setLoading(false);
        }
      }
    }

    init();

    // Auth state listener
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "INITIAL_SESSION" || isNavigatingRef.current) return;

      setSession(newSession ?? null);

      if (!newSession?.access_token) {
        setUser(null);
        setProfileLoading(false);
        return;
      }

      // Debounce profile fetch
      if (profileFetchTimerRef.current) clearTimeout(profileFetchTimerRef.current);
      profileFetchTimerRef.current = window.setTimeout(async () => {
        setProfileLoading(true);
        const profile = await fetchUserProfile(newSession.access_token);
        if (!mountedRef.current) return;
        if (profile) setUser(profile);
        setProfileLoading(false);
      }, 300);
    });

    return () => {
      mountedRef.current = false;
      data?.subscription?.unsubscribe();
      if (profileFetchTimerRef.current) clearTimeout(profileFetchTimerRef.current);
    };
  }, [fetchUserProfile]);

  const isOnboardingComplete = useMemo(
    () => !!user?.onboarding_completed,
    [user?.onboarding_completed]
  );
  
  const userPlan = useMemo(() => user?.plan || "Free", [user?.plan]);
  const canAccessTeam = useMemo(
    () => ["Team", "Enterprise"].includes(userPlan),
    [userPlan]
  );

  const workspaceId = useMemo(() => workspace?.id || null, [workspace?.id]);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      profileLoading,
      githubSignIn,
      logout,
      refreshUser,
      isOnboardingComplete,
      userPlan,
      canAccessTeam,
      workspaceId,
      workspace,
    }),
    [
      user,
      session,
      loading,
      profileLoading,
      githubSignIn,
      logout,
      refreshUser,
      isOnboardingComplete,
      userPlan,
      canAccessTeam,
      workspaceId,
      workspace,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};