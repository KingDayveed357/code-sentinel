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
import { bootstrapWorkspace, listWorkspaces } from "@/lib/api/workspaces";
import { useWorkspaceStore } from "@/stores/workspace-store";


type AuthUser = User & {
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
  githubSignIn: (inviteToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  isOnboardingComplete: boolean;
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
  
  // Use centralized workspace store
  const { setWorkspace: setWorkspaceInStore, setWorkspaces, setInitializing, startValidating, finishValidating } = useWorkspaceStore();

  // Instrumentation: mount log
  useEffect(() => {
    console.log("AuthProvider mounted");
  }, []);

  // Fetch profile from backend
  const fetchUserProfile = useCallback(async (accessToken?: string) => {
    try {
      const resp = await authApi.me();
      const maybeUser = (resp as any)?.user;
      if (!maybeUser) return null;
      return maybeUser as AuthUser;
    } catch (err) {
      // console.error("fetchUserProfile error:", err);
      return null;
    }
  }, []);

  // Fetch and initialize workspaces
  const fetchAndInitWorkspaces = useCallback(async (isInitialLoad = false) => {
    if (!mountedRef.current) return;
    
    // ✅ FIX: Use different lifecycle methods for initial vs background refresh
    if (isInitialLoad) {
      // First load: use setInitializing
      setInitializing(true);
    } else {
      // Background refresh: use startValidating (doesn't block UI)
      startValidating();
    }
    
    try {
      // 1. Fetch all accessible workspaces first
      const allWorkspaces = await listWorkspaces();
      setWorkspaces(allWorkspaces);

      // 2. Determine target workspace ID from URL or LocalStorage
      let targetWorkspaceId: string | null = null;
      if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          targetWorkspaceId = params.get('workspace') || localStorage.getItem('active_workspace_id');
      }

      // 3. Find the target workspace in our list
      let activeWorkspace = allWorkspaces.find(w => w.id === targetWorkspaceId);

      // 4. If not found (or no target), fall back to bootstrap/personal
      if (!activeWorkspace) {
          // console.log('⚠️ Target workspace not found, bootstrapping personal...');
          const { workspace: bootstrapped } = await bootstrapWorkspace();
          activeWorkspace = bootstrapped;
          
          // Ensure bootstrapped workspace is in our list
          if (!allWorkspaces.find(w => w.id === activeWorkspace.id)) {
            setWorkspaces([...allWorkspaces, activeWorkspace]);
          }
      }

      if (activeWorkspace) {
          // console.log('✅ Setting active workspace:', activeWorkspace.name);
          setWorkspace(activeWorkspace);
          setWorkspaceInStore(activeWorkspace);
          if (typeof window !== 'undefined') {
              localStorage.setItem('active_workspace_id', activeWorkspace.id);
          }
      }

    } catch (error) {
      console.error('❌ Workspace initialization failed:', error);
    } finally {
      if (mountedRef.current) {
        if (isInitialLoad) {
          setInitializing(false);
        } else {
          finishValidating();
        }
      }
    }
  }, [setWorkspaceInStore, setWorkspaces, setInitializing, startValidating, finishValidating]);

  // Refresh user public method
  const refreshUser = useCallback(async () => {
    const curr = await getCurrentSession();
    if (!curr?.access_token) return;
    const profile = await fetchUserProfile(curr.access_token);
    if (!profile) return;
    setUser((prev) => {
      if (
        prev?.id === profile.id &&
        prev?.onboarding_completed === profile.onboarding_completed
      ) {
        return prev;
      }
      return profile;
    });
  }, [fetchUserProfile]);

  // GitHub OAuth Sign In
  const githubSignIn = useCallback(async (inviteToken?: string) => {
    try {
      isNavigatingRef.current = true;
      const { url } = await authApi.githubOAuth(inviteToken);
      window.location.href = url;
    } catch (err) {
      // console.error("GitHub OAuth error:", err);
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
      // console.error("logout error:", err);
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
        // console.log('🔐 Fetching user profile...');
        const profile = await fetchUserProfile(session.access_token);
        if (!mountedRef.current) return;
        if (profile) {
          // console.log('✅ User profile loaded:', profile.email);
          setUser(profile);
        } 
        
        // Step 2: Initialize Workspace using reusable function
        await fetchAndInitWorkspaces(true); // ✅ FIX: Mark as initial load

        // Step 3: Clean up OAuth token from URL (if present)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('code') || urlParams.has('access_token')) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }

      } catch (err) {
        // console.error('❌ Auth init error:', err);
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

      // Only treat explicit sign-out events as unauthenticated.
      // Sometimes the provider emits transient nulls during token refresh; ignore those.
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        setSession(null);
        setUser(null);
        setProfileLoading(false);
        return;
      }

      if (!newSession?.access_token) {
        // Ignore transient missing session for background token refresh
        console.log('AuthProvider: transient missing session received, ignoring', { event });
        return;
      }

      setSession(newSession);

      // Debounce profile fetch
      if (profileFetchTimerRef.current) clearTimeout(profileFetchTimerRef.current);
      profileFetchTimerRef.current = window.setTimeout(async () => {
        setProfileLoading(true);
        const profile = await fetchUserProfile(newSession.access_token);
        if (!mountedRef.current) return;

        if (profile) setUser(profile);
        setProfileLoading(false);

        // Important: Re-fetch workspaces on session change (e.g. login)
        await fetchAndInitWorkspaces(false); // ✅ FIX: Background refresh, don't block UI
      }, 300);
    });

    return () => {
      mountedRef.current = false;
      data?.subscription?.unsubscribe();
      if (profileFetchTimerRef.current) clearTimeout(profileFetchTimerRef.current);
    };
  }, [fetchUserProfile, fetchAndInitWorkspaces]);

  const isOnboardingComplete = useMemo(
    () => !!user?.onboarding_completed,
    [user?.onboarding_completed]
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
      refreshWorkspaces: fetchAndInitWorkspaces,
      isOnboardingComplete,
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
      fetchAndInitWorkspaces,
      isOnboardingComplete,
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